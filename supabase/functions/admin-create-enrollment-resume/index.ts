import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";
import { EnrollmentHandoffError, getOrCreateEnrollmentHandoff } from "../_shared/enrollmentHandoff.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { user, adminClient } = await requireAdmin(req);
    const body = await req.json() as { onboardingId?: string };
    const onboardingId = body.onboardingId?.trim() ?? "";
    if (!isValidReferrerUserId(onboardingId)) {
      return errorResponse("Valid onboarding id is required", 400, "invalid_request");
    }

    const { token, expiresAt, reused } = await getOrCreateEnrollmentHandoff(adminClient, onboardingId);

    const siteUrl = (Deno.env.get("PNCL_SITE_URL") ?? "http://localhost:8080").replace(/\/$/, "");
    const resumeUrl = `${siteUrl}/onboarding/success/${onboardingId}?token=${encodeURIComponent(token)}`;
    logOnboarding("admin_enrollment_resume_created", { adminId: user.id, onboardingId, expiresAt, reused });
    return jsonResponse({ resumeUrl, expiresAt, message: reused ? "The active resume link was copied." : "A 24-hour resume link was created." });
  } catch (error) {
    if (error instanceof AdminAuthError || error instanceof EnrollmentHandoffError) return errorResponse(error.message, error.status, error.code);
    const message = error instanceof Error ? error.message : "Unable to create resume link";
    return errorResponse(message, 500, "resume_failed");
  }
});
