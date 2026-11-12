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
  enrollmentReady?: boolean;
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
    if (error) throw new Error("Unable to verify existing portal accounts");
    if (!data.users.length) break;

    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match.id;

    if (data.users.length < 200) return null;
    page++;
  }
  if (page > 10) throw new Error("Portal account lookup requires support review");
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
      enrollment_version: 3,
      enrollment_ready: input.enrollmentReady === true,
    },
  };
}

function isDuplicateEmailError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("already been registered")
    || normalized.includes("already exists")
    || normalized.includes("duplicate");
}

async function verifyExistingPortalUser(
  supabase: SupabaseClient,
  userId: string,
  input: ProvisionPortalAccountInput,
): Promise<void> {
  const { error } = await supabase.rpc("check_portal_account_link", {
    p_onboarding: input.onboardingId,
    p_user: userId,
    p_email: input.email.trim().toLowerCase(),
  });
  if (error) throw new Error("Existing portal identity needs support review before linking");
  // Existing identities keep their roles, names, confirmation and readiness.
  // Email equality alone must never overwrite server-owned account provenance.
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
        await verifyExistingPortalUser(supabase, existingId, input);
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
      await verifyExistingPortalUser(supabase, existingId, input);
      return existingId;
    })()
    : await createPortalUser(supabase, input);

  // Persist the identity before mail delivery or caller-side finalization can
  // fail. A retry reuses this link; it does not create a second account.
  const { error: linkError } = await supabase.rpc("persist_portal_account_link", {
    p_onboarding: input.onboardingId,
    p_user: supabaseUserId,
    p_email: input.email.trim().toLowerCase(),
  });
  if (linkError) throw new Error("Unable to save the portal account link; contact support");

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

  return provisionPortalUser(supabase, { ...input, existingSupabaseUserId: existingId }, { sendWelcomeEmail: true, delivery: "provision" });
}

export async function markPortalEnrollmentReady(
  supabase: SupabaseClient,
  userId: string,
  onboardingId: string,
): Promise<void> {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      onboarding_id: onboardingId,
      source: "agent_onboarding",
      role: "agent",
      enrollment_version: 3,
      enrollment_ready: true,
    },
  });
  if (error) throw new Error(`Unable to activate portal enrollment: ${error.message}`);
}

export async function resendPortalInvite(
  supabase: SupabaseClient,
  input: ProvisionPortalAccountInput,
): Promise<string> {
  return provisionPortalUser(supabase, input, { sendWelcomeEmail: true, delivery: "resend" });
}
