import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { isValidCompLevel } from "../_shared/compLevel.ts";
import {
  createReferralInvite,
  toReferralInviteSummary,
} from "../_shared/portalReferralInvites.ts";

interface CreateReferralInvitePayload {
  compLevel?: unknown;
  recipientLabel?: unknown;
}

function validatePayload(body: unknown): { compLevel: number; recipientLabel: string } {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as CreateReferralInvitePayload;
  const compLevel = typeof data.compLevel === "number"
    ? data.compLevel
    : typeof data.compLevel === "string"
    ? Number.parseInt(data.compLevel, 10)
    : Number.NaN;

  if (!isValidCompLevel(compLevel)) {
    throw new Error("Select a valid comp level.");
  }

  const recipientLabel = typeof data.recipientLabel === "string"
    ? data.recipientLabel.trim()
    : "";

  if (!recipientLabel) {
    throw new Error("Add a nickname for this recruit.");
  }

  if (recipientLabel.length > 120) {
    throw new Error("Nickname is too long.");
  }

  return { compLevel, recipientLabel };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const payload = validatePayload(await req.json());
    const invite = await createReferralInvite(
      adminClient,
      user.id,
      payload.compLevel,
      payload.recipientLabel,
    );

    return jsonResponse({
      invite: toReferralInviteSummary(invite),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to create referral invite";
    return errorResponse(message, 400);
  }
});
