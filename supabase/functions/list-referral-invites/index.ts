import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  listReferralInvitesForUser,
  loadReferrerCompLevel,
  toReferralInviteSummary,
} from "../_shared/portalReferralInvites.ts";
import { getReferralCompOptions } from "../_shared/compLevel.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const [compLevel, invites] = await Promise.all([
      loadReferrerCompLevel(adminClient, user.id),
      listReferralInvitesForUser(adminClient, user.id),
    ]);

    return jsonResponse({
      compLevel,
      compOptions: getReferralCompOptions(compLevel),
      invites: invites.map((invite) => toReferralInviteSummary(invite, user.id)),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load referral invites";
    return errorResponse(message, 500);
  }
});
