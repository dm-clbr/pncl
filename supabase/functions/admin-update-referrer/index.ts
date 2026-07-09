import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  getDescendantUserIds,
  loadOnboardingForPortalUser,
  resolveDisplayName,
} from "../_shared/adminAgents.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  getEmailDomain,
  isValidReferrerUserId,
  parseLegalName,
  resolveReferrer,
} from "../_shared/onboarding.ts";
import {
  encryptTemporaryPassword,
  generateHandoffToken,
  hashHandoffToken,
} from "../_shared/security.ts";

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

    const onboarding = await loadOnboardingForPortalUser(
      adminClient,
      payload.userId,
      email,
      targetData.user.app_metadata?.onboarding_id,
    );

    let uplineNetwork = onboarding?.upline_network ?? "PNCL";
    if (payload.referrerUserId) {
      const referrer = await resolveReferrer(adminClient, payload.referrerUserId);
      if (!referrer) {
        return errorResponse("Referrer not found", 404, "referrer_not_found");
      }
      uplineNetwork = referrer.name;
    }

    let onboardingId = onboarding?.id ?? null;

    if (onboarding) {
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
    } else {
      // Manually added accounts may have no onboarding record; create a
      // minimal one (same shape as admin-create-user) so the hierarchy can
      // track their upline.
      const legalName = resolveDisplayName(targetData.user);
      const { firstName, lastName } = parseLegalName(legalName);
      const handoffTokenHash = await hashHandoffToken(generateHandoffToken());
      const handoffTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const placeholderEncrypted = await encryptTemporaryPassword("manual-provision");

      const { data: record, error: insertError } = await adminClient
        .from("onboarding_records")
        .insert({
          legal_name: legalName,
          first_name: firstName,
          last_name: lastName,
          phone_number: "000-000-0000",
          date_of_birth: "01/01/1900",
          ssn_encrypted: placeholderEncrypted,
          state_of_residence: "TX",
          upline_network: uplineNetwork,
          has_license: "No",
          npn: null,
          has_eo_insurance: "No",
          referrer_user_id: payload.referrerUserId,
          workspace_email: email,
          supabase_user_id: payload.userId,
          status: "manual",
          handoff_token_hash: handoffTokenHash,
          handoff_token_expires_at: handoffTokenExpiresAt,
        })
        .select("id")
        .single();

      if (insertError || !record) {
        logOnboarding("admin_update_referrer_create_record_failed", {
          userId: payload.userId,
          error: insertError?.message ?? "no record",
        }, "error");
        return errorResponse("Unable to create onboarding record for this user", 500, "update_failed");
      }

      onboardingId = record.id;

      await adminClient.auth.admin.updateUserById(payload.userId, {
        app_metadata: {
          ...targetData.user.app_metadata,
          onboarding_id: record.id,
        },
      });
    }

    logOnboarding("admin_referrer_updated", {
      adminId: adminUser.id,
      userId: payload.userId,
      referrerUserId: payload.referrerUserId,
      onboardingId,
      createdRecord: !onboarding,
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
