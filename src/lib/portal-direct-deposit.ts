import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";
import { DIRECT_DEPOSIT_TODO_SLUG } from "@/lib/direct-deposit-content";

export type DirectDepositAccountType = "checking" | "savings";

export interface PortalDirectDepositFormValues {
  legalName: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  accountType: DirectDepositAccountType;
  accountNumber: string;
  routingNumber: string;
  signatureName: string;
  authorizationAccepted: boolean;
}

export interface PortalDirectDepositSummary {
  userId: string;
  legalName: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  accountType: DirectDepositAccountType;
  signatureName: string;
  signedAt: string;
  pdfPath: string;
}

export const EMPTY_DIRECT_DEPOSIT_FORM: PortalDirectDepositFormValues = {
  legalName: "",
  addressLine1: "",
  city: "",
  state: "",
  zip: "",
  accountType: "checking",
  accountNumber: "",
  routingNumber: "",
  signatureName: "",
  authorizationAccepted: false,
};

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export { US_STATES };

function normalizeDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function formatRoutingNumberInput(value: string): string {
  return normalizeDigits(value, 9);
}

export function formatAccountNumberInput(value: string): string {
  return normalizeDigits(value, 17);
}

export function getDefaultDirectDepositValues(
  user: User | null,
  profile?: { firstName: string; lastName: string } | null,
): PortalDirectDepositFormValues {
  const firstName = profile?.firstName?.trim()
    ?? (typeof user?.user_metadata?.first_name === "string" ? user.user_metadata.first_name.trim() : "");
  const lastName = profile?.lastName?.trim()
    ?? (typeof user?.user_metadata?.last_name === "string" ? user.user_metadata.last_name.trim() : "");
  const legalName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    ...EMPTY_DIRECT_DEPOSIT_FORM,
    legalName,
    signatureName: legalName,
  };
}

export function validatePortalDirectDepositForm(values: PortalDirectDepositFormValues): string | null {
  if (!values.legalName.trim()) return "Name is required.";
  if (!values.addressLine1.trim()) return "Address is required.";
  if (!values.city.trim()) return "City is required.";
  if (!/^[A-Z]{2}$/.test(values.state.trim().toUpperCase())) return "State must be a two-letter code.";
  if (!/^\d{5}(-\d{4})?$/.test(values.zip.trim())) return "Enter a valid ZIP code.";
  const accountNumber = formatAccountNumberInput(values.accountNumber);
  if (accountNumber.length < 4 || accountNumber.length > 17) {
    return "Enter a valid account number (4–17 digits).";
  }
  const routingNumber = formatRoutingNumberInput(values.routingNumber);
  if (routingNumber.length !== 9) return "Enter a valid 9-digit routing number.";
  if (!values.signatureName.trim()) return "Signature is required.";
  if (!values.authorizationAccepted) return "You must accept the authorization statement.";
  return null;
}

interface DirectDepositRow {
  user_id: string;
  legal_name: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  account_type: DirectDepositAccountType;
  signature_name: string;
  signed_at: string;
  pdf_path: string;
}

function mapDirectDepositSummary(row: DirectDepositRow): PortalDirectDepositSummary {
  return {
    userId: row.user_id,
    legalName: row.legal_name,
    addressLine1: row.address_line1,
    city: row.city,
    state: row.state,
    zip: row.zip,
    accountType: row.account_type,
    signatureName: row.signature_name,
    signedAt: row.signed_at,
    pdfPath: row.pdf_path,
  };
}

export async function fetchPortalDirectDeposit(userId: string): Promise<PortalDirectDepositSummary | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_direct_deposit_forms")
    .select("user_id, legal_name, address_line1, city, state, zip, account_type, signature_name, signed_at, pdf_path")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapDirectDepositSummary(data as DirectDepositRow) : null;
}

export async function submitPortalDirectDeposit(
  accessToken: string,
  values: PortalDirectDepositFormValues,
): Promise<PortalDirectDepositSummary> {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Portal authentication is not configured.");
  }

  const validationError = validatePortalDirectDepositForm(values);
  if (validationError) {
    throw new Error(validationError);
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/submit-portal-direct-deposit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      legalName: values.legalName.trim(),
      addressLine1: values.addressLine1.trim(),
      city: values.city.trim(),
      state: values.state.trim().toUpperCase(),
      zip: values.zip.trim(),
      accountType: values.accountType,
      accountNumber: formatAccountNumberInput(values.accountNumber),
      routingNumber: formatRoutingNumberInput(values.routingNumber),
      signatureName: values.signatureName.trim(),
      authorizationAccepted: values.authorizationAccepted,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to submit direct deposit form");
  }

  return data.directDeposit as PortalDirectDepositSummary;
}

export async function getDirectDepositPdfUrl(pdfPath: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from("portal-profile-documents")
    .createSignedUrl(pdfPath, 3600);

  if (error) throw error;
  return data?.signedUrl ?? null;
}

export function isDirectDepositTodoComplete(user: User | null, directDepositSubmitted: boolean): boolean {
  if (directDepositSubmitted) return true;
  const completed = user?.user_metadata?.completed_portal_todos;
  if (!completed || typeof completed !== "object" || Array.isArray(completed)) {
    return false;
  }
  return (completed as Record<string, boolean>)[DIRECT_DEPOSIT_TODO_SLUG] === true;
}

export { DIRECT_DEPOSIT_TODO_SLUG };
