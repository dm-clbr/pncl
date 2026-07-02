import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { backfillGoogleWorkspaceRecovery } from "../_shared/googleRecoveryBackfill.ts";
import { logOnboarding } from "../_shared/logger.ts";

interface BackfillPayload {
  dryRun?: boolean;
  limit?: number;
  onboardingId?: string;
  userId?: string;
}

function validatePayload(body: unknown): BackfillPayload {
  if (!body || typeof body !== "object") {
    return {};
  }

  const data = body as Record<string, unknown>;
  const limitRaw = data.limit;
  const limit = typeof limitRaw === "number"
    ? limitRaw
    : typeof limitRaw === "string"
    ? Number.parseInt(limitRaw, 10)
    : undefined;

  const onboardingId = typeof data.onboardingId === "string" ? data.onboardingId.trim() : "";
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";

  return {
    dryRun: data.dryRun === true,
    limit: Number.isFinite(limit) && (limit as number) > 0 ? limit as number : undefined,
    onboardingId: onboardingId || undefined,
    userId: userId || undefined,
  };
}

function buildUserMessage(
  summary: Awaited<ReturnType<typeof backfillGoogleWorkspaceRecovery>>,
  singleTarget: boolean,
): string {
  if (singleTarget && summary.scanned === 0) {
    return "No onboarding record found for this user.";
  }

  if (singleTarget && summary.results.length === 1) {
    const result = summary.results[0];
    if (result.status === "updated") {
      return `Google recovery info updated for ${result.workspaceEmail}.`;
    }
    if (result.reason === "dry_run") {
      return `Would update Google recovery info for ${result.workspaceEmail}.`;
    }
    if (result.status === "error") {
      return result.reason ?? "Unable to update Google recovery info.";
    }
    if (result.reason === "missing_personal_email") {
      return "This onboarding record is missing a valid personal email address.";
    }
    if (result.reason === "google_user_not_found") {
      return "No Google Workspace user was found for this PNCL email.";
    }
    return result.reason ?? "Google recovery info was not updated.";
  }

  const wouldUpdateCount = summary.results.filter((result) => result.reason === "dry_run").length;

  if (summary.dryRun) {
    return `Dry run complete. ${wouldUpdateCount} Google account${wouldUpdateCount === 1 ? "" : "s"} would receive updated recovery info.`;
  }

  return `Updated Google recovery info for ${summary.updated} account${summary.updated === 1 ? "" : "s"}.`;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const payload = validatePayload(await req.json());
    const singleTarget = Boolean(payload.onboardingId || payload.userId);

    const summary = await backfillGoogleWorkspaceRecovery(adminClient, {
      dryRun: payload.dryRun ?? false,
      limit: payload.limit,
      onboardingId: payload.onboardingId,
      userId: payload.userId,
    });

    logOnboarding("admin_backfill_google_recovery_completed", {
      adminId: adminUser.id,
      dryRun: summary.dryRun,
      scanned: summary.scanned,
      updated: summary.updated,
      skipped: summary.skipped,
      errors: summary.errors,
      singleTarget,
    });

    if (singleTarget && summary.scanned === 0) {
      return errorResponse(buildUserMessage(summary, true), 404, "not_found");
    }

    if (singleTarget && summary.errors === 1 && summary.results[0]?.status === "error") {
      return errorResponse(
        buildUserMessage(summary, true),
        500,
        "backfill_failed",
      );
    }

    if (singleTarget && summary.skipped === 1 && summary.results[0]?.status === "skipped") {
      const reason = summary.results[0].reason;
      if (reason && reason !== "dry_run") {
        return errorResponse(buildUserMessage(summary, true), 409, reason);
      }
    }

    return jsonResponse({
      ...summary,
      message: buildUserMessage(summary, singleTarget),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to backfill Google recovery info";
    logOnboarding("admin_backfill_google_recovery_failed", { error: message }, "error");
    return errorResponse(message, 500, "backfill_failed");
  }
});
