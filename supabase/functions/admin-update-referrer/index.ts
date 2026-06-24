import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getDescendantUserIds, loadOnboardingForPortalUser } from "../_shared/adminAgents.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { getEmailDomain, isValidReferrerUserId, resolveReferrer } from "../_shared/onboarding.ts";

interface UpdateReferrerPayload {
  userId: string;
  referrerUserId: string | null;
}

function validatePayload(body: unknown): UpdateReferrerPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!isValidReferrerUserId(userId)) {
    throw new Error("Valid user id is required");
  }

  const rawReferrer = data.referrerUserId;
  if (rawReferrer === null || rawReferrer === undefined || rawReferrer === "") {
    return { userId, referrerUserId: null };
  }

  if (typeof rawReferrer !== "string" || !isValidReferrerUserId(rawReferrer.trim())) {
    throw new Error("Valid referrer user id is required");
  }

  return { userId, referrerUserId: rawReferrer.trim() };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const payload = validatePayload(await req.json());
    const emailDomain = getEmailDomain();

    const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(
      payload.userId,
    );
    if (targetError || !targetData.user?.email) {
      return errorResponse("User not found", 404, "not_found");
    }

    const email = targetData.user.email.toLowerCase();
    if (!email.endsWith(`@${emailDomain}`)) {
      return errorResponse(`Only @${emailDomain} portal accounts can be managed here.`, 400, "invalid_domain");
    }

    if (payload.referrerUserId === payload.userId) {
      return errorResponse("A user cannot be their own upline.", 400, "self_referrer");
    }

    if (payload.referrerUserId) {
      const descendants = await getDescendantUserIds(adminClient, payload.userId);
      if (descendants.has(payload.referrerUserId)) {
        return errorResponse(
          "Cannot assign upline to someone in this user's downline.",
          409,
          "referrer_cycle",
        );
      }
    }

    const onboarding = await loadOnboardingForPortalUser(adminClient, payload.userId, email);
    if (!onboarding) {
      return errorResponse("Onboarding record not found", 404, "not_found");
    }

    let uplineNetwork = onboarding.upline_network;
    if (payload.referrerUserId) {
      const referrer = await resolveReferrer(adminClient, payload.referrerUserId);
      if (!referrer) {
        return errorResponse("Referrer not found", 404, "referrer_not_found");
      }
      uplineNetwork = referrer.name;
    }

    const { error: updateError } = await adminClient
      .from("onboarding_records")
      .update({
        referrer_user_id: payload.referrerUserId,
        upline_network: uplineNetwork,
      })
      .eq("id", onboarding.id);

    if (updateError) {
      logOnboarding("admin_update_referrer_failed", {
        userId: payload.userId,
        error: updateError.message,
      }, "error");
      return errorResponse("Unable to update upline", 500, "update_failed");
    }

    logOnboarding("admin_referrer_updated", {
      adminId: adminUser.id,
      userId: payload.userId,
      referrerUserId: payload.referrerUserId,
    });

    return jsonResponse({
      userId: payload.userId,
      referrerUserId: payload.referrerUserId,
      uplineNetwork,
      message: payload.referrerUserId ? "Upline updated." : "Upline removed.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update upline";
    logOnboarding("admin_update_referrer_request_failed", { error: message }, "error");
    return errorResponse(message, 500, "update_failed");
  }
});
