import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { provisionEnrollment } from "../_shared/enrollmentProvisioning.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";
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
    const result = await provisionEnrollment(adminClient, onboardingId, { requestId: crypto.randomUUID() });
    logOnboarding("admin_enrollment_retry_completed", {
      adminId: user.id,
      onboardingId,
      status: result.status,
      failedStep: result.failedStep ?? null,
    });
    return jsonResponse({ result, message: result.status === "ready" ? "Enrollment is ready." : result.userMessage });
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    const message = error instanceof Error ? error.message : "Unable to retry enrollment";
    logOnboarding("admin_enrollment_retry_failed", { error: message }, "error");
    return errorResponse(message, 500, "retry_failed");
  }
});
