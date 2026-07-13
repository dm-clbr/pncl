import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  canonicalPartnerPair,
  findPartnerLinkForUser,
} from "../_shared/hierarchyPartners.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";

interface UnlinkPartnersPayload {
  userId: string;
}

function validatePayload(body: unknown): UnlinkPartnersPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!isValidReferrerUserId(userId)) {
    throw new Error("Valid user id is required");
  }

  return { userId };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const payload = validatePayload(await req.json());
    const existingLink = await findPartnerLinkForUser(adminClient, payload.userId);

    if (!existingLink) {
      return errorResponse("No business partner link found for this user", 404, "partner_not_found");
    }

    const { error } = await adminClient
      .from("hierarchy_partner_links")
      .delete()
      .eq("id", existingLink.id);

    if (error) {
      logOnboarding("admin_unlink_partners_failed", { error: error.message }, "error");
      return errorResponse("Unable to unlink partners", 500, "unlink_failed");
    }

    logOnboarding("admin_partners_unlinked", {
      userId: payload.userId,
      partnerLinkId: existingLink.id,
      adminUserId: user.id,
    });

    return jsonResponse({
      userId: payload.userId,
      message: "Business partners unlinked.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to unlink partners";
    logOnboarding("admin_unlink_partners_request_failed", { error: message }, "error");
    return errorResponse(message, 400, "invalid_request");
  }
});
