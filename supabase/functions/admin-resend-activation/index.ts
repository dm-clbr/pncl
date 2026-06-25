import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { getEmailDomain, isValidReferrerUserId, parseLegalName } from "../_shared/onboarding.ts";
import { resendPortalInvite } from "../_shared/portalAuth.ts";

interface ResendActivationPayload {
  userId: string;
}

function validatePayload(body: unknown): ResendActivationPayload {
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

async function loadOnboardingRecord(
  adminClient: SupabaseClient,
  userId: string,
  email: string,
) {
  const { data: byUserId } = await adminClient
    .from("onboarding_records")
    .select("id, legal_name, first_name, last_name, workspace_email, supabase_user_id")
    .eq("supabase_user_id", userId)
    .maybeSingle();

  if (byUserId) return byUserId;

  const { data: byEmail } = await adminClient
    .from("onboarding_records")
    .select("id, legal_name, first_name, last_name, workspace_email, supabase_user_id")
    .eq("workspace_email", email)
    .maybeSingle();

  return byEmail;
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

    const targetUser = targetData.user;
    const email = targetUser.email.toLowerCase();

    if (!email.endsWith(`@${emailDomain}`)) {
      return errorResponse(`Only @${emailDomain} portal accounts can be managed here.`, 400, "invalid_domain");
    }

    const record = await loadOnboardingRecord(adminClient, payload.userId, email);

    const legalName = record?.legal_name
      ?? (typeof targetUser.user_metadata?.full_name === "string"
        ? targetUser.user_metadata.full_name
        : email.split("@")[0]);
    const parsed = parseLegalName(legalName);
    const firstName = record?.first_name
      ?? (typeof targetUser.user_metadata?.first_name === "string"
        ? targetUser.user_metadata.first_name
        : parsed.firstName);
    const lastName = record?.last_name
      ?? (typeof targetUser.user_metadata?.last_name === "string"
        ? targetUser.user_metadata.last_name
        : parsed.lastName);
    const onboardingId = record?.id
      ?? (typeof targetUser.app_metadata?.onboarding_id === "string"
        ? targetUser.app_metadata.onboarding_id
        : null);

    if (!onboardingId) {
      return errorResponse("No onboarding record found for this user.", 404, "onboarding_not_found");
    }

    const supabaseUserId = await resendPortalInvite(adminClient, {
      email,
      legalName,
      firstName,
      lastName,
      onboardingId,
      existingSupabaseUserId: payload.userId,
    });

    if (record && record.supabase_user_id !== supabaseUserId) {
      await adminClient
        .from("onboarding_records")
        .update({ supabase_user_id: supabaseUserId })
        .eq("id", onboardingId);
    }

    logOnboarding("admin_activation_resent", {
      adminId: adminUser.id,
      userId: payload.userId,
      onboardingId,
      email,
      supabaseUserId,
    });

    return jsonResponse({
      userId: payload.userId,
      email,
      message: "Portal welcome email sent.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to resend activation email";
    logOnboarding("admin_resend_activation_failed", { error: message }, "error");
    return errorResponse(message, 500, "resend_failed");
  }
});
