import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";
import { linkRepairMessages } from "../_shared/portalLinkRepair.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { user, adminClient } = await requireAdmin(req);
    const body = await req.json().catch(() => null);
    if (typeof body?.onboardingId !== "string" || typeof body?.expectedUserId !== "string"
      || !isValidReferrerUserId(body.onboardingId) || !isValidReferrerUserId(body.expectedUserId)) {
      return errorResponse("Valid onboarding and expected Hub account IDs are required.", 400, "invalid_request");
    }
    const { data, error } = await adminClient.rpc("reconcile_portal_account_link", {
      p_admin: user.id, p_onboarding: body.onboardingId, p_expected_user: body.expectedUserId,
    });
    if (error) return errorResponse(linkRepairMessages[error.message] ?? "The link could not be repaired. Refresh and review the account.", 409, "link_repair_failed");
    return jsonResponse({ ...data, message: data?.alreadyLinked ? "The account is already connected." : "Existing Hub account connected. Original onboarding completion preserved." });
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    return errorResponse("Unable to reconcile the onboarding account link.", 500, "link_repair_failed");
  }
});
