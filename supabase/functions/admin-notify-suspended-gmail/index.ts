import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { backfillSuspendedGmailVerificationEmails } from "../_shared/gmailVerificationNotifications.ts";
import { logOnboarding } from "../_shared/logger.ts";

interface NotifyPayload {
  dryRun?: boolean;
  forceResend?: boolean;
  limit?: number;
}

function validatePayload(body: unknown): NotifyPayload {
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

  return {
    dryRun: data.dryRun === true,
    forceResend: data.forceResend === true,
    limit: Number.isFinite(limit) && (limit as number) > 0 ? limit as number : undefined,
  };
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

    const summary = await backfillSuspendedGmailVerificationEmails(adminClient, {
      dryRun: payload.dryRun ?? false,
      forceResend: payload.forceResend ?? false,
      limit: payload.limit,
    });

    logOnboarding("admin_notify_suspended_gmail_completed", {
      adminId: adminUser.id,
      dryRun: summary.dryRun,
      scanned: summary.scanned,
      sent: summary.sent,
      skipped: summary.skipped,
      errors: summary.errors,
    });

    const wouldSendCount = summary.results.filter((result) => result.reason === "dry_run").length;

    return jsonResponse({
      ...summary,
      message: summary.dryRun
        ? `Dry run complete. ${wouldSendCount} automatically suspended account${wouldSendCount === 1 ? "" : "s"} would receive verification email.`
        : `Gmail verification email sent for ${summary.sent} automatically suspended account${summary.sent === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to notify suspended Gmail users";
    logOnboarding("admin_notify_suspended_gmail_failed", { error: message }, "error");
    return errorResponse(message, 500, "notify_failed");
  }
});
