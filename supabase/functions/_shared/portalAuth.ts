import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logOnboarding } from "./logger.ts";
import { sendPortalActivationEmail } from "./resend.ts";

export interface ProvisionPortalAccountInput {
  email: string;
  legalName: string;
  firstName: string;
  lastName: string;
  onboardingId: string;
  existingSupabaseUserId?: string | null;
}

export function getPortalActivateUrl(): string {
  const siteUrl = Deno.env.get("PNCL_SITE_URL") ?? "http://localhost:8080";
  return `${siteUrl.replace(/\/$/, "")}/onboarding/activate`;
}

async function findPortalUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const normalized = email.toLowerCase();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) break;

    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match.id;

    if (data.users.length < 200) break;
    page++;
  }

  return null;
}

async function removeUnconfirmedPortalUser(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  onboardingId: string,
): Promise<void> {
  const { data: existing, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !existing.user) {
    throw new Error("Unable to load existing portal account");
  }

  if (existing.user.email_confirmed_at) {
    return;
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) {
    logOnboarding("portal_user_delete_failed", {
      onboardingId,
      email,
      error: deleteError.message,
    }, "error");
    throw new Error("Unable to reset portal account");
  }

  logOnboarding("portal_user_removed_for_reinvite", {
    onboardingId,
    email,
    previousUserId: userId,
  });
}

async function sendPortalInvite(
  supabase: SupabaseClient,
  input: ProvisionPortalAccountInput,
): Promise<string> {
  const redirectTo = getPortalActivateUrl();
  const userMetadata = {
    full_name: input.legalName,
    first_name: input.firstName,
    last_name: input.lastName,
  };
  const appMetadata = {
    onboarding_id: input.onboardingId,
    source: "agent_onboarding",
    role: "agent",
  };

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: {
      redirectTo,
      data: userMetadata,
    },
  });

  if (error) {
    logOnboarding("portal_invite_failed", {
      onboardingId: input.onboardingId,
      email: input.email,
      error: error.message,
    }, "error");
    throw new Error(error.message);
  }

  if (!data.user?.id) {
    throw new Error("Unable to provision portal account");
  }

  const activationUrl = data.properties?.action_link;
  if (!activationUrl) {
    logOnboarding("portal_invite_link_missing", {
      onboardingId: input.onboardingId,
      email: input.email,
    }, "error");
    throw new Error("Unable to generate portal activation link");
  }

  const { error: metadataError } = await supabase.auth.admin.updateUserById(data.user.id, {
    app_metadata: appMetadata,
  });

  if (metadataError) {
    logOnboarding("portal_user_metadata_failed", {
      onboardingId: input.onboardingId,
      email: input.email,
      error: metadataError.message,
    }, "warn");
  }

  await sendPortalActivationEmail({
    to: input.email,
    firstName: input.firstName,
    activationUrl,
  });

  logOnboarding("portal_invite_sent", {
    onboardingId: input.onboardingId,
    email: input.email,
    supabaseUserId: data.user.id,
    redirectTo,
    delivery: "resend",
  });

  return data.user.id;
}

export async function sendPortalConfirmationEmail(
  supabase: SupabaseClient,
  email: string,
  firstName: string,
): Promise<void> {
  const redirectTo = getPortalActivateUrl();

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });

  if (error) {
    logOnboarding("portal_confirmation_resend_failed", { email, error: error.message }, "error");
    throw new Error(error.message);
  }

  const activationUrl = data.properties?.action_link;
  if (!activationUrl) {
    throw new Error("Unable to generate portal activation link");
  }

  await sendPortalActivationEmail({
    to: email,
    firstName,
    activationUrl,
  });

  logOnboarding("portal_confirmation_resent", { email, redirectTo, delivery: "resend" });
}

export async function provisionPortalAccount(
  supabase: SupabaseClient,
  input: ProvisionPortalAccountInput,
): Promise<string> {
  const existingId = input.existingSupabaseUserId
    ?? await findPortalUserByEmail(supabase, input.email);

  if (existingId) {
    const { data: existing, error } = await supabase.auth.admin.getUserById(existingId);
    if (error || !existing.user) {
      throw new Error("Unable to load existing portal account");
    }

    if (existing.user.email_confirmed_at) {
      logOnboarding("portal_already_active", {
        onboardingId: input.onboardingId,
        email: input.email,
        supabaseUserId: existingId,
      });
      return existingId;
    }

    await removeUnconfirmedPortalUser(supabase, existingId, input.email, input.onboardingId);
  }

  return sendPortalInvite(supabase, input);
}

export async function resendPortalInvite(
  supabase: SupabaseClient,
  input: ProvisionPortalAccountInput,
): Promise<string> {
  const existingId = input.existingSupabaseUserId
    ?? await findPortalUserByEmail(supabase, input.email);

  if (existingId) {
    const { data: existing, error } = await supabase.auth.admin.getUserById(existingId);
    if (error || !existing.user) {
      throw new Error("Unable to load portal account");
    }

    if (existing.user.email_confirmed_at) {
      throw new Error("Portal account is already active");
    }

    await removeUnconfirmedPortalUser(supabase, existingId, input.email, input.onboardingId);
  }

  return sendPortalInvite(supabase, input);
}
