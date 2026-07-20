import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireCountyFromZip } from "./usZipCounty.ts";

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
  address_line1: string | null;
  address_city: string | null;
  address_zip: string | null;
  county: string | null;
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
  referrer_user_id: string | null;
  personal_email: string | null;
  onboarding_completed_at: string | null;
  genesis_notification_sent_at: string | null;
  google_creation_error: string | null;
  group_assignment_error: string | null;
  gmail_verification_email_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingImagePayload {
  base64: string;
  contentType: string;
  extension: string;
}

export interface SubmitOnboardingPayload {
  legalName: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  dateOfBirth: string;
  ssn: string;
  stateOfResidence: string;
  addressLine1: string;
  addressCity: string;
  addressZip: string;
  uplineNetwork: string;
  hasLicense: string;
  npn?: string;
  hasEoInsurance: string;
  referralInviteId?: string;
  contractSignatureId: string;
  driversLicenseImage: OnboardingImagePayload;
  profilePhotoImage?: OnboardingImagePayload;
}

export interface ReferrerInfo {
  id: string;
  name: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidReferrerUserId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function resolveReferrerDisplayName(
  metadata: Record<string, unknown> | undefined,
  email: string,
): string | null {
  const fullName = metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }

  const firstName = metadata?.first_name;
  const lastName = metadata?.last_name;
  if (typeof firstName === "string" && firstName.trim()) {
    const last = typeof lastName === "string" ? lastName.trim() : "";
    return [firstName.trim(), last].filter(Boolean).join(" ");
  }

  const localPart = email.split("@")[0]?.trim();
  return localPart || null;
}

async function findOnboardingReferrerName(
  supabase: SupabaseClient,
  filters: { supabaseUserId?: string; workspaceEmail?: string },
): Promise<string | null> {
  let query = supabase
    .from("onboarding_records")
    .select("legal_name")
    .not("status", "eq", "failed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (filters.supabaseUserId) {
    query = query.eq("supabase_user_id", filters.supabaseUserId);
  } else if (filters.workspaceEmail) {
    query = query.eq("workspace_email", filters.workspaceEmail);
  } else {
    return null;
  }

  const { data: record } = await query.maybeSingle();
  const legalName = record?.legal_name;
  return typeof legalName === "string" && legalName.trim() ? legalName.trim() : null;
}

export async function resolveReferrer(
  supabase: SupabaseClient,
  referrerUserId: string,
): Promise<ReferrerInfo | null> {
  if (!isValidReferrerUserId(referrerUserId)) {
    return null;
  }

  const onboardingName = await findOnboardingReferrerName(supabase, {
    supabaseUserId: referrerUserId,
  });
  if (onboardingName) {
    return { id: referrerUserId, name: onboardingName };
  }

  const { data: userData, error } = await supabase.auth.admin.getUserById(referrerUserId);
  if (error || !userData.user) {
    return null;
  }

  const emailDomain = getEmailDomain();
  const email = userData.user.email?.toLowerCase() ?? "";
  if (!email.endsWith(`@${emailDomain}`) || !userData.user.email_confirmed_at) {
    return null;
  }

  const onboardingNameByEmail = await findOnboardingReferrerName(supabase, {
    workspaceEmail: email,
  });
  if (onboardingNameByEmail) {
    return { id: referrerUserId, name: onboardingNameByEmail };
  }

  const name = resolveReferrerDisplayName(userData.user.user_metadata, email);
  if (!name) {
    return null;
  }

  return { id: referrerUserId, name };
}

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// ~5 MB decoded (base64 inflates by ~4/3).
const MAX_IMAGE_BASE64_LENGTH = 7_200_000;

function parseImagePayload(value: unknown, field: string): OnboardingImagePayload {
  if (value == null || value === "") {
    throw new Error(`${field} is required`);
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be an image`);
  }

  const match = value.trim().match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/);
  if (!match) {
    throw new Error(`${field} must be a JPG, PNG, or WebP image`);
  }

  const [, contentType, base64] = match;
  if (base64.length > MAX_IMAGE_BASE64_LENGTH) {
    throw new Error(`${field} must be 5 MB or smaller`);
  }

  return {
    base64,
    contentType,
    extension: IMAGE_MIME_EXTENSIONS[contentType] ?? "jpg",
  };
}

function normalizeOptionalImage(value: unknown, field: string): OnboardingImagePayload | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return parseImagePayload(value, field);
}

export function decodeImageBytes(payload: OnboardingImagePayload): Uint8Array {
  const binary = atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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

  const addressLine1 = normalizeRequiredString(data.addressLine1, "addressLine1");
  const addressCity = normalizeRequiredString(data.addressCity, "addressCity");
  const addressZipRaw = normalizeRequiredString(data.addressZip, "addressZip").replace(/\D/g, "");
  if (addressZipRaw.length !== 5) {
    throw new Error("ZIP code must be 5 digits");
  }
  const county = requireCountyFromZip(addressZipRaw);

  const uplineNetwork = normalizeRequiredString(data.uplineNetwork, "uplineNetwork");
  const hasLicense = normalizeYesNo(data.hasLicense, "hasLicense");
  const hasEoInsurance = normalizeYesNo(data.hasEoInsurance, "hasEoInsurance");
  const npn = typeof data.npn === "string" ? data.npn.trim() : "";
  const referralInviteId = typeof data.referralInviteId === "string" && isValidReferrerUserId(data.referralInviteId)
    ? data.referralInviteId
    : undefined;

  const contractSignatureId = typeof data.contractSignatureId === "string"
    ? data.contractSignatureId.trim()
    : "";
  if (!isValidReferrerUserId(contractSignatureId)) {
    throw new Error("A signed Independent Contractor Agreement is required before submitting");
  }

  const driversLicenseImage = parseImagePayload(
    data.driversLicenseImageBase64,
    "Driver's license image",
  );
  const profilePhotoImage = normalizeOptionalImage(
    data.profilePhotoImageBase64,
    "Profile photo",
  );

  return {
    legalName,
    firstName,
    lastName,
    phoneNumber,
    dateOfBirth,
    ssn,
    stateOfResidence,
    addressLine1,
    addressCity,
    addressZip: addressZipRaw,
    county,
    uplineNetwork,
    hasLicense,
    npn: npn || undefined,
    hasEoInsurance,
    referralInviteId,
    contractSignatureId,
    driversLicenseImage,
    profilePhotoImage,
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

/** Failed onboarding where Google created the account but auto-suspended it before first sign-in. */
export function isAutoSuspendedOnboardingFailure(record: OnboardingRecord): boolean {
  if (record.status !== "failed") return false;
  if (!record.temporary_password_encrypted) return false;
  const error = record.google_creation_error?.toLowerCase() ?? "";
  return error.includes("automatically suspended");
}
