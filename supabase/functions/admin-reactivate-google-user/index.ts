import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { resolveOnboardingRecordForVerification } from "../_shared/gmailVerificationNotifications.ts";
import {
  getWorkspaceUser,
  unsuspendWorkspaceUser,
} from "../_shared/googleWorkspace.ts";
import { logOnboarding } from "../_shared/logger.ts";

interface ReactivatePayload {
  onboardingId?: string;
  userId?: string;
}

function validatePayload(body: unknown): ReactivatePayload {
  if (!body || typeof body !== "object") {
    return {};
  }

  const data = body as Record<string, unknown>;
  const onboardingId = typeof data.onboardingId === "string" ? data.onboardingId.trim() : "";
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";

  return {
    onboardingId: onboardingId || undefined,
    userId: userId || undefined,
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

    if (!payload.onboardingId && !payload.userId) {
      return errorResponse("Onboarding id or user id is required", 400, "invalid_request");
    }

    const record = await resolveOnboardingRecordForVerification(adminClient, payload);
    if (!record) {
      return errorResponse("Onboarding record not found for this user.", 404, "not_found");
    }

    const workspaceEmail = record.workspace_email?.trim().toLowerCase() ?? "";
    if (!workspaceEmail) {
      return errorResponse("This onboarding record has no PNCL email.", 409, "missing_workspace_email");
    }

    const googleUser = await getWorkspaceUser(record.google_user_id ?? workspaceEmail);
    if (!googleUser) {
      return errorResponse("No Google Workspace user was found for this PNCL email.", 404, "google_user_not_found");
    }

    if (!googleUser.suspended) {
      return jsonResponse({
        workspaceEmail,
        wasSuspended: false,
        message:
          "This Google account is already active. If the agent still sees phone verification, use Google Admin → Users → Security → turn off login challenges for 10 minutes while they sign in.",
      });
    }

    await unsuspendWorkspaceUser(googleUser.id);

    logOnboarding("admin_reactivate_google_user_completed", {
      adminId: adminUser.id,
      onboardingId: record.id,
      workspaceEmail,
    });

    return jsonResponse({
      workspaceEmail,
      wasSuspended: true,
      message:
        `Reactivated ${workspaceEmail} in Google Workspace. Have the agent sign in again with the temporary password from the verification email.`,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to reactivate Google account";
    logOnboarding("admin_reactivate_google_user_failed", { error: message }, "error");
    return errorResponse(message, 500, "reactivate_failed");
  }
});
