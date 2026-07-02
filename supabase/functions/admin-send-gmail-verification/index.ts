import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  processSuspendedGmailOnboardingRecord,
  resolveOnboardingRecordForVerification,
} from "../_shared/gmailVerificationNotifications.ts";
import { logOnboarding } from "../_shared/logger.ts";

interface SendPayload {
  onboardingId?: string;
  userId?: string;
  forceResend?: boolean;
}

function validatePayload(body: unknown): SendPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const onboardingId = typeof data.onboardingId === "string" ? data.onboardingId.trim() : "";
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";

  if (!onboardingId && !userId) {
    throw new Error("Onboarding id or user id is required");
  }

  return {
    onboardingId: onboardingId || undefined,
    userId: userId || undefined,
    forceResend: data.forceResend === true,
  };
}

function buildUserMessage(result: Awaited<ReturnType<typeof processSuspendedGmailOnboardingRecord>>): string {
  if (result.status === "sent") {
    return `Gmail verification email sent to ${result.personalEmail}.`;
  }

  if (result.reason === "not_suspended") {
    return "This Google account is not suspended, so no verification email was sent.";
  }

  if (result.reason === "not_automatically_suspended") {
    return "This account is suspended manually in Google. Use Google Admin Console to reactivate it.";
  }

  if (result.reason === "already_sent") {
    return "A Gmail verification email was already sent for this onboarding record.";
  }

  if (result.reason === "missing_personal_email") {
    return "This onboarding record is missing a personal email address.";
  }

  if (result.reason === "google_user_not_found") {
    return "No Google Workspace user was found for this PNCL email.";
  }

  return result.reason ?? "Unable to send Gmail verification email.";
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
    const record = await resolveOnboardingRecordForVerification(adminClient, payload);

    if (!record) {
      return errorResponse("Onboarding record not found for this user.", 404, "not_found");
    }

    const result = await processSuspendedGmailOnboardingRecord(
      adminClient,
      record,
      {
        dryRun: false,
        forceResend: payload.forceResend ?? false,
        updateRecovery: true,
        sendEmail: true,
      },
    );

    logOnboarding("admin_send_gmail_verification_completed", {
      adminId: adminUser.id,
      onboardingId: record.id,
      workspaceEmail: result.workspaceEmail,
      status: result.status,
      reason: result.reason ?? null,
    });

    if (result.status === "error") {
      return errorResponse(result.reason ?? "Unable to send Gmail verification email", 500, "send_failed");
    }

    if (result.status === "skipped") {
      return errorResponse(buildUserMessage(result), 409, result.reason ?? "skipped");
    }

    return jsonResponse({
      ...result,
      message: buildUserMessage(result),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to send Gmail verification email";
    logOnboarding("admin_send_gmail_verification_failed", { error: message }, "error");
    return errorResponse(message, 400);
  }
});
