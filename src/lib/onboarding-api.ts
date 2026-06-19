import {
  logOnboardingReveal,
  logOnboardingStatusError,
  logOnboardingStatusPoll,
  logOnboardingSubmitError,
  logOnboardingSubmitStarted,
  logOnboardingSubmitSuccess,
} from "./onboarding-logger";

export interface SubmitOnboardingInput {
  legalName: string;
  phoneNumber: string;
  personalEmail: string;
  dateOfBirth: string;
  ssn: string;
  stateOfResidence: string;
  uplineNetwork: string;
  hasLicense: string;
  npn: string;
  hasEoInsurance: string;
}

export interface SubmitOnboardingResponse {
  onboardingId: string;
  handoffToken: string;
  status: OnboardingStatus;
  workspaceEmail?: string;
  error?: string;
}

export type OnboardingStatus =
  | "pending"
  | "creating_email"
  | "email_created"
  | "ready"
  | "credentials_viewed"
  | "failed"
  | "expired";

export interface OnboardingStatusResponse {
  status: OnboardingStatus;
  message?: string;
  email?: string;
  credentialsViewed?: boolean;
  gmailUrl?: string;
  portalInviteSent?: boolean;
  error?: string;
}

export interface RevealCredentialsResponse {
  email: string;
  temporaryPassword: string;
  mustChangePassword: boolean;
  gmailUrl: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function getFunctionUrl(path: string): string {
  if (!supabaseUrl) {
    throw new Error("Supabase is not configured");
  }
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${path}`;
}

function getHeaders(): HeadersInit {
  if (!supabaseAnonKey) {
    throw new Error("Supabase is not configured");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${supabaseAnonKey}`,
    apikey: supabaseAnonKey,
  };
}

export async function submitOnboarding(
  input: SubmitOnboardingInput,
): Promise<SubmitOnboardingResponse> {
  logOnboardingSubmitStarted(input.legalName);

  const response = await fetch(getFunctionUrl("submit-onboarding"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      legalName: input.legalName,
      phoneNumber: input.phoneNumber,
      personalEmail: input.personalEmail,
      dateOfBirth: input.dateOfBirth,
      ssn: input.ssn,
      stateOfResidence: input.stateOfResidence,
      uplineNetwork: input.uplineNetwork,
      hasLicense: input.hasLicense,
      npn: input.npn || undefined,
      hasEoInsurance: input.hasEoInsurance,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.message ?? "Unable to submit onboarding";
    logOnboardingSubmitError(message, { httpStatus: response.status });
    throw new Error(message);
  }

  logOnboardingSubmitSuccess(data.onboardingId, data.status, {
    workspaceEmail: data.workspaceEmail ?? "",
    error: data.error ?? "",
  });
  return data;
}

export async function getOnboardingStatus(
  id: string,
  token: string,
): Promise<OnboardingStatusResponse> {
  const url = new URL(getFunctionUrl("get-onboarding-status"));
  url.searchParams.set("id", id);
  url.searchParams.set("token", token);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getHeaders(),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.message ?? "Unable to fetch onboarding status";
    logOnboardingStatusError(id, message);
    throw new Error(message);
  }

  logOnboardingStatusPoll(id, data.status, {
    workspaceEmail: data.email ?? "",
    error: data.error ?? "",
    message: data.message ?? "",
  });
  return data;
}

export async function revealOnboardingCredentials(
  id: string,
  token: string,
): Promise<RevealCredentialsResponse> {
  const response = await fetch(getFunctionUrl("reveal-onboarding-credentials"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ id, token }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.message ?? "Unable to reveal credentials";
    logOnboardingReveal(id, "error", message);
    const err = new Error(message) as Error & {
      code?: string;
    };
    err.code = data.error;
    throw err;
  }

  logOnboardingReveal(id, "success");
  return data;
}

export interface SetupPortalAccountResponse {
  email: string;
  message: string;
}

export async function resendPortalInvite(
  id: string,
  token: string,
): Promise<SetupPortalAccountResponse> {
  const response = await fetch(getFunctionUrl("setup-portal-account"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ id, token }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to resend portal activation email");
  }
  return data;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function buildGmailUrl(email: string): string {
  return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(email)}&continue=https://mail.google.com/mail/`;
}
