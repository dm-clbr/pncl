import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logOnboarding } from "./logger.ts";
import { sendPortalWelcomeEmail } from "./resend.ts";

export interface ProvisionPortalAccountInput {
  email: string;
  legalName: string;
  firstName: string;
  lastName: string;
  onboardingId: string;
  existingSupabaseUserId?: string | null;
}

export function getPortalLoginUrl(): string {
  const siteUrl = Deno.env.get("PNCL_SITE_URL") ?? "http://localhost:8080";
  return `${siteUrl.replace(/\/$/, "")}/portal/login`;
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

function buildPortalMetadata(input: ProvisionPortalAccountInput) {
  return {
    userMetadata: {
      full_name: input.legalName,
      first_name: input.firstName,
      last_name: input.lastName,
    },
    appMetadata: {
      onboarding_id: input.onboardingId,
      source: "agent_onboarding",
      role: "agent",
    },
  };
}

function isDuplicateEmailError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("already been registered")
    || normalized.includes("already exists")
    || normalized.includes("duplicate");
}

async function syncPortalUserMetadata(
  supabase: SupabaseClient,
  userId: string,
  input: ProvisionPortalAccountInput,
): Promise<void> {
  const { userMetadata, appMetadata } = buildPortalMetadata(input);
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    email_confirm: true,
    user_metadata: userMetadata,
    app_metadata: appMetadata,
  });

  if (error) {
    logOnboarding("portal_user_metadata_failed", {
      onboardingId: input.onboardingId,
      email: input.email,
      error: error.message,
    }, "warn");
  }
}

async function createPortalUser(
  supabase: SupabaseClient,
  input: ProvisionPortalAccountInput,
): Promise<string> {
  const { userMetadata, appMetadata } = buildPortalMetadata(input);

  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: userMetadata,
    app_metadata: appMetadata,
  });

  if (error) {
    if (isDuplicateEmailError(error.message)) {
      const existingId = await findPortalUserByEmail(supabase, input.email);
      if (existingId) {
        await syncPortalUserMetadata(supabase, existingId, input);
        return existingId;
      }
    }

    logOnboarding("portal_user_create_failed", {
      onboardingId: input.onboardingId,
      email: input.email,
      error: error.message,
    }, "error");
    throw new Error(error.message);
  }

  if (!data.user?.id) {
    throw new Error("Unable to provision portal account");
  }

  return data.user.id;
}

async function sendPortalWelcome(
  input: ProvisionPortalAccountInput,
  supabaseUserId: string,
  delivery: "provision" | "resend",
): Promise<void> {
  const loginUrl = getPortalLoginUrl();

  await sendPortalWelcomeEmail({
    to: input.email,
    firstName: input.firstName,
    loginUrl,
  });

  logOnboarding(delivery === "provision" ? "portal_welcome_sent" : "portal_welcome_resent", {
    onboardingId: input.onboardingId,
    email: input.email,
    supabaseUserId,
    loginUrl,
    delivery: "resend",
  });
}

async function provisionPortalUser(
  supabase: SupabaseClient,
  input: ProvisionPortalAccountInput,
  options: { sendWelcomeEmail: boolean; delivery: "provision" | "resend" },
): Promise<string> {
  const existingId = input.existingSupabaseUserId
    ?? await findPortalUserByEmail(supabase, input.email);

  const supabaseUserId = existingId
    ? await (async () => {
      await syncPortalUserMetadata(supabase, existingId, input);
      return existingId;
    })()
    : await createPortalUser(supabase, input);

  if (options.sendWelcomeEmail) {
    await sendPortalWelcome(input, supabaseUserId, options.delivery);
  }

  return supabaseUserId;
}

export async function sendPortalConfirmationEmail(
  supabase: SupabaseClient,
  email: string,
  firstName: string,
): Promise<void> {
  const loginUrl = getPortalLoginUrl();

  await sendPortalWelcomeEmail({
    to: email,
    firstName,
    loginUrl,
  });

  logOnboarding("portal_welcome_resent", { email, loginUrl, delivery: "resend" });
}

export async function provisionPortalAccount(
  supabase: SupabaseClient,
  input: ProvisionPortalAccountInput,
): Promise<string> {
  const existingId = input.existingSupabaseUserId
    ?? await findPortalUserByEmail(supabase, input.email);

  if (existingId) {
    logOnboarding("portal_already_active", {
      onboardingId: input.onboardingId,
      email: input.email,
      supabaseUserId: existingId,
    });
  }

  return provisionPortalUser(supabase, input, { sendWelcomeEmail: true, delivery: "provision" });
}

export async function resendPortalInvite(
  supabase: SupabaseClient,
  input: ProvisionPortalAccountInput,
): Promise<string> {
  return provisionPortalUser(supabase, input, { sendWelcomeEmail: true, delivery: "resend" });
}
