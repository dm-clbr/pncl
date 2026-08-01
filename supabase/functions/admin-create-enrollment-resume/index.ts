import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";
import { generateHandoffToken, hashHandoffToken } from "../_shared/security.ts";
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

    const token = generateHandoffToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await adminClient
      .from("onboarding_records")
      .update({
        handoff_token_hash: await hashHandoffToken(token),
        handoff_token_expires_at: expiresAt,
      })
      .eq("id", onboardingId)
      .select("id")
      .maybeSingle();
    if (error || !data) return errorResponse("Enrollment not found", 404, "not_found");

    const siteUrl = (Deno.env.get("PNCL_SITE_URL") ?? "http://localhost:8080").replace(/\/$/, "");
    const resumeUrl = `${siteUrl}/onboarding/success/${onboardingId}?token=${encodeURIComponent(token)}`;
    logOnboarding("admin_enrollment_resume_created", { adminId: user.id, onboardingId, expiresAt });
    return jsonResponse({ resumeUrl, expiresAt, message: "A 24-hour resume link was created." });
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    const message = error instanceof Error ? error.message : "Unable to create resume link";
    return errorResponse(message, 500, "resume_failed");
  }
});
