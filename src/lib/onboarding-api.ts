export interface SubmitOnboardingInput {
  legalName: string;
  phoneNumber: string;
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
  const response = await fetch(getFunctionUrl("submit-onboarding"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      legalName: input.legalName,
      phoneNumber: input.phoneNumber,
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
    throw new Error(data.message ?? "Unable to submit onboarding");
  }
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
    throw new Error(data.message ?? "Unable to fetch onboarding status");
  }
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
    const err = new Error(data.message ?? "Unable to reveal credentials") as Error & {
      code?: string;
    };
    err.code = data.error;
    throw err;
  }
  return data;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function buildGmailUrl(email: string): string {
  return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(email)}&continue=https://mail.google.com/mail/`;
}
