import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  getEmailDomain,
  isValidReferrerUserId,
  parseLegalName,
  resolveReferrer,
} from "../_shared/onboarding.ts";
import { provisionPortalAccount } from "../_shared/portalAuth.ts";
import { isValidCompLevel } from "../_shared/compLevel.ts";
import { updateAgentCompLevel } from "../_shared/portalReferralInvites.ts";
import {
  encryptTemporaryPassword,
  generateHandoffToken,
  hashHandoffToken,
} from "../_shared/security.ts";

interface CreateUserPayload {
  legalName: string;
  email: string;
  uplineNetwork?: string;
  referrerUserId?: string;
  compLevel?: number;
}

function validateCreatePayload(body: unknown): CreateUserPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const legalName = typeof data.legalName === "string" ? data.legalName.trim() : "";
  if (!legalName) throw new Error("Legal name is required");

  const emailRaw = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  if (!emailRaw) throw new Error("Email is required");

  const emailDomain = getEmailDomain();
  if (!emailRaw.endsWith(`@${emailDomain}`)) {
    throw new Error(`Email must use @${emailDomain}`);
  }

  const uplineNetwork = typeof data.uplineNetwork === "string" ? data.uplineNetwork.trim() : "";
  const referrerUserId = typeof data.referrerUserId === "string" && isValidReferrerUserId(data.referrerUserId)
    ? data.referrerUserId
    : undefined;

  const compLevelRaw = data.compLevel;
  const compLevel = typeof compLevelRaw === "number"
    ? compLevelRaw
    : typeof compLevelRaw === "string"
    ? Number.parseInt(compLevelRaw, 10)
    : undefined;

  if (compLevel != null && !isValidCompLevel(compLevel)) {
    throw new Error("Select a valid comp level.");
  }

  return {
    legalName,
    email: emailRaw,
    uplineNetwork: uplineNetwork || undefined,
    referrerUserId,
    compLevel,
  };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const payload = validateCreatePayload(await req.json());
    const { firstName, lastName } = parseLegalName(payload.legalName);

    let uplineNetwork = payload.uplineNetwork ?? "PNCL";
    let referrerUserId: string | null = null;

    if (payload.referrerUserId) {
      const referrer = await resolveReferrer(adminClient, payload.referrerUserId);
      if (referrer) {
        referrerUserId = referrer.id;
        uplineNetwork = referrer.name;
      }
    }

    const handoffToken = generateHandoffToken();
    const handoffTokenHash = await hashHandoffToken(handoffToken);
    const handoffTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const placeholderEncrypted = await encryptTemporaryPassword("manual-provision");

    const { data: record, error: insertError } = await adminClient
      .from("onboarding_records")
      .insert({
        legal_name: payload.legalName,
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
        referrer_user_id: referrerUserId,
        workspace_email: payload.email,
        status: "manual",
        handoff_token_hash: handoffTokenHash,
        handoff_token_expires_at: handoffTokenExpiresAt,
      })
      .select("id")
      .single();

    if (insertError || !record) {
      logOnboarding("admin_create_user_db_failed", {
        email: payload.email,
        error: insertError?.message ?? "no record",
      }, "error");
      return errorResponse("Unable to create agent record", 500, "create_failed");
    }

    const supabaseUserId = await provisionPortalAccount(adminClient, {
      email: payload.email,
      legalName: payload.legalName,
      firstName,
      lastName,
      onboardingId: record.id,
    });

    await adminClient.auth.admin.updateUserById(supabaseUserId, {
      app_metadata: {
        onboarding_id: record.id,
        source: "admin_manual",
        role: "agent",
      },
    });

    await adminClient
      .from("onboarding_records")
      .update({ supabase_user_id: supabaseUserId })
      .eq("id", record.id);

    if (payload.compLevel != null) {
      await updateAgentCompLevel(adminClient, supabaseUserId, payload.compLevel);
    }

    logOnboarding("admin_user_created", {
      adminId: adminUser.id,
      onboardingId: record.id,
      email: payload.email,
      supabaseUserId,
      referrerUserId,
    });

    return jsonResponse({
      id: supabaseUserId,
      onboardingId: record.id,
      email: payload.email,
      name: payload.legalName,
      message: "Portal welcome email sent.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to create user";
    logOnboarding("admin_create_user_failed", { error: message }, "error");
    return errorResponse(message, 500, "create_failed");
  }
});
