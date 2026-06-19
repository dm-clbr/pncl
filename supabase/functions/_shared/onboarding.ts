import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing Supabase service configuration");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getEmailDomain(): string {
  return Deno.env.get("PNCL_EMAIL_DOMAIN") ?? "thepncl.com";
}

export function buildGmailUrl(email: string): string {
  return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(email)}&continue=https://mail.google.com/mail/`;
}

export const ONBOARDING_STATUSES = [
  "pending",
  "creating_email",
  "email_created",
  "ready",
  "credentials_viewed",
  "failed",
  "expired",
] as const;

export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export interface OnboardingRecord {
  id: string;
  legal_name: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  date_of_birth: string;
  ssn_encrypted: string;
  state_of_residence: string;
  upline_network: string;
  has_license: string;
  npn: string | null;
  has_eo_insurance: string;
  workspace_email: string | null;
  status: OnboardingStatus;
  handoff_token_hash: string;
  handoff_token_expires_at: string;
  temporary_password_encrypted: string | null;
  credentials_viewed_at: string | null;
  google_user_id: string | null;
  supabase_user_id: string | null;
  google_creation_error: string | null;
  group_assignment_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitOnboardingPayload {
  legalName: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  personalEmail: string;
  dateOfBirth: string;
  ssn: string;
  stateOfResidence: string;
  uplineNetwork: string;
  hasLicense: string;
  npn?: string;
  hasEoInsurance: string;
}

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

export function parseLegalName(legalName: string): { firstName: string; lastName: string } {
  const parts = legalName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Legal name is required");
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function validateSubmitPayload(body: unknown): SubmitOnboardingPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const data = body as Record<string, unknown>;

  const legalName = normalizeRequiredString(data.legalName, "legalName");
  const { firstName, lastName } = parseLegalName(legalName);

  const phoneRaw = normalizeRequiredString(data.phoneNumber, "phoneNumber");
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  if (phoneDigits.length !== 10) {
    throw new Error("Phone number must use the format 111-222-3333");
  }
  const phoneNumber = `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;

  const personalEmail = normalizeRequiredString(data.personalEmail, "personalEmail").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) {
    throw new Error("Personal email must be a valid email address");
  }
  const emailDomain = Deno.env.get("PNCL_EMAIL_DOMAIN") ?? "thepncl.com";
  if (personalEmail.endsWith(`@${emailDomain}`)) {
    throw new Error(`Personal email cannot be a @${emailDomain} address`);
  }

  const dateOfBirth = normalizeRequiredString(data.dateOfBirth, "dateOfBirth");
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateOfBirth)) {
    throw new Error("Date of birth must use mm/dd/yyyy format");
  }

  const ssnRaw = normalizeRequiredString(data.ssn, "ssn");
  const ssnDigits = ssnRaw.replace(/\D/g, "");
  if (ssnDigits.length !== 9) {
    throw new Error("Social Security Number must use the format 111-22-3333");
  }
  const ssn = `${ssnDigits.slice(0, 3)}-${ssnDigits.slice(3, 5)}-${ssnDigits.slice(5)}`;

  const stateOfResidence = normalizeRequiredString(data.stateOfResidence, "stateOfResidence").toUpperCase();
  if (!US_STATES.has(stateOfResidence)) {
    throw new Error("Invalid state of residence");
  }

  const uplineNetwork = normalizeRequiredString(data.uplineNetwork, "uplineNetwork");
  const hasLicense = normalizeYesNo(data.hasLicense, "hasLicense");
  const hasEoInsurance = normalizeYesNo(data.hasEoInsurance, "hasEoInsurance");
  const npn = typeof data.npn === "string" ? data.npn.trim() : "";

  return {
    legalName,
    firstName,
    lastName,
    phoneNumber,
    personalEmail,
    dateOfBirth,
    ssn,
    stateOfResidence,
    uplineNetwork,
    hasLicense,
    npn: npn || undefined,
    hasEoInsurance,
  };
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function normalizeYesNo(value: unknown, field: string): string {
  if (value !== "Yes" && value !== "No") {
    throw new Error(`${field} must be Yes or No`);
  }
  return value;
}

export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}
