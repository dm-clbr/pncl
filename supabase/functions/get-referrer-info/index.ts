import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/onboarding.ts";
import { resolveReferralInvitePublicInfo } from "../_shared/portalReferralInvites.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const url = new URL(req.url);
    const ref = url.searchParams.get("ref")?.trim() ?? "";

    if (!ref) {
      return errorResponse("Missing referral id", 400, "invalid_request");
    }

    const supabase = getServiceClient();
    const resolved = await resolveReferralInvitePublicInfo(supabase, ref);

    return jsonResponse({
      inviteId: resolved.invite.id,
      id: resolved.referrerId,
      name: resolved.referrerName,
      compLevel: resolved.compLevel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load referrer";
    const status = message.includes("no longer valid") ? 410 : 404;
    const code = status === 410 ? "legacy_referral_disabled" : "not_found";
    return errorResponse(message, status, code);
  }
});
