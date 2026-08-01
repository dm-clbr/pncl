import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  buildGmailUrl,
  getServiceClient,
  isAutoSuspendedOnboardingFailure,
  isTokenExpired,
  type OnboardingRecord,
} from "../_shared/onboarding.ts";
import { validateHandoffToken } from "../_shared/security.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { isEnrollmentReady } from "../_shared/enrollmentState.ts";

const TERMINAL_STATUSES = new Set([
  "ready",
  "failed",
  "expired",
  "credentials_viewed",
]);

function buildStatusResponse(record: OnboardingRecord) {
  const credentialsViewed = !!record.credentials_viewed_at;
  const email = record.workspace_email ?? undefined;
  const gmailUrl = email ? buildGmailUrl(email) : undefined;

  const steps = {
    referral: record.referral_status,
    contract: record.contract_status,
    application: record.application_status,
    google: record.google_account_status,
    portal: record.portal_account_status,
    finalization: record.finalization_status,
  };
  const enrollmentReady = isEnrollmentReady(record)
    && Boolean(record.google_user_id)
    && Boolean(record.supabase_user_id);

  if (record.enrollment_status === "awaiting_google_sign_in") {
    return {
      status: "email_created",
      enrollmentStatus: "awaiting_google_sign_in",
      email,
      credentialsViewed,
      gmailUrl,
      portalInviteSent: Boolean(record.supabase_user_id),
      message: "Your PNCL email is ready. Sign in to Gmail, create your password, then return here to enter the portal.",
      steps,
    };
  }

  if (
    record.enrollment_status === "google_verification_required"
    || record.google_account_status === "verification_required"
    || isAutoSuspendedOnboardingFailure(record)
  ) {
      return {
        status: "failed",
        enrollmentStatus: "google_verification_required",
        email,
        credentialsViewed: false,
        gmailUrl,
        portalInviteSent: false,
        message: "Your PNCL email was created. Google needs a quick verification before you can sign in.",
        pendingGmailVerification: true,
        retryable: true,
        failedStep: "google",
        steps,
      };
  }

  if (
    record.enrollment_status === "needs_attention"
    || record.status === "failed"
    || (record.enrollment_status === "ready" && !enrollmentReady)
  ) {
    const identityConflict = record.failure_code === "identity_reserved_by_another_enrollment";
    return {
      status: "failed",
      enrollmentStatus: record.enrollment_status,
      message: identityConflict
        ? "Another active enrollment already protects this applicant. Contact PNCL support."
        : "We couldn’t finish account setup. Your progress is saved and it is safe to retry.",
      email,
      failedStep: record.failed_step ?? undefined,
      retryable: !identityConflict,
      steps,
    };
  }

  if (credentialsViewed || record.status === "credentials_viewed") {
    return {
      status: "credentials_viewed",
      email,
      credentialsViewed: true,
      gmailUrl,
      portalInviteSent: Boolean(record.supabase_user_id),
      message: "Temporary sign-in details have already been viewed.",
    };
  }

  if (enrollmentReady) {
    return {
      status: "ready",
      enrollmentStatus: "ready",
      email,
      credentialsViewed: false,
      gmailUrl,
      portalInviteSent: Boolean(record.supabase_user_id),
      message: "Your PNCL email is ready.",
      steps,
    };
  }

  return {
    status: "creating_email",
    enrollmentStatus: record.enrollment_status,
    message: "Your PNCL email and portal account are being created.",
    steps,
  };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const token = url.searchParams.get("token");

    if (!id || !token) {
      logOnboarding("status_request_invalid", { reason: "missing_id_or_token" }, "warn");
      return errorResponse("Missing onboarding id or token", 400, "invalid_request");
    }

    const supabase = getServiceClient();
    const { data: record, error } = await supabase
      .from("onboarding_records")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !record) {
      logOnboarding("status_record_not_found", { onboardingId: id }, "warn");
      return errorResponse("Onboarding record not found", 404, "not_found");
    }

    const tokenValid = await validateHandoffToken(token, record.handoff_token_hash);
    if (!tokenValid) {
      logOnboarding("status_invalid_token", { onboardingId: id }, "warn");
      return errorResponse("Invalid sign-in handoff token.", 403, "invalid_token");
    }

    if (isTokenExpired(record.handoff_token_expires_at)) {
      logOnboarding("status_token_expired", { onboardingId: id, status: record.status }, "warn");
      return jsonResponse({
        status: "expired",
        message: "This sign-in link has expired.",
      });
    }

    const statusResponse = buildStatusResponse(record as OnboardingRecord);
    logOnboarding("status_returned", {
      onboardingId: id,
      status: statusResponse.status,
      workspaceEmail: record.workspace_email ?? null,
      googleCreationError: record.google_creation_error ?? null,
    });

    return jsonResponse(statusResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logOnboarding("status_request_failed", { error: message }, "error");
    return errorResponse("Unable to fetch onboarding status", 500);
  }
});

export { TERMINAL_STATUSES };
