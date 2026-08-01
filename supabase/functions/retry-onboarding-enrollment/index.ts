import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { provisionEnrollment } from "../_shared/enrollmentProvisioning.ts";
import { getServiceClient, isTokenExpired } from "../_shared/onboarding.ts";
import { validateHandoffToken } from "../_shared/security.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json() as { id?: string; token?: string };
    if (!body.id || !body.token) return errorResponse("Missing enrollment id or token", 400, "invalid_request");

    const supabase = getServiceClient();
    const { data: record, error } = await supabase
      .from("onboarding_records")
      .select("id, handoff_token_hash, handoff_token_expires_at")
      .eq("id", body.id)
      .maybeSingle();
    if (error || !record) return errorResponse("Enrollment not found", 404, "not_found");
    if (!await validateHandoffToken(body.token, record.handoff_token_hash)) {
      return errorResponse("Invalid enrollment token", 403, "invalid_token");
    }
    if (isTokenExpired(record.handoff_token_expires_at)) {
      return errorResponse("This recovery link has expired. Ask an admin for a new resume link.", 410, "expired_token");
    }

    const result = await provisionEnrollment(supabase, record.id, { requestId: crypto.randomUUID() });
    logOnboarding("enrollment_user_retry_completed", {
      onboardingId: record.id,
      status: result.status,
      failedStep: result.failedStep ?? null,
    });
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retry enrollment";
    logOnboarding("enrollment_user_retry_failed", { error: message }, "error");
    return errorResponse("Unable to retry enrollment right now", 500, "retry_failed");
  }
});
