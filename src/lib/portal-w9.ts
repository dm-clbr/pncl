import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";
import {
  taxClassToStoredLabel,
  type W9LlcClassification,
  type W9TaxClassOptionId,
} from "@/lib/w9-content";

export type W9TinType = "ssn" | "ein";

export interface PortalW9FormValues {
  legalName: string;
  businessName: string;
  taxClass: W9TaxClassOptionId | "";
  llcClassification: W9LlcClassification | "";
  hasForeignPartners: boolean;
  exemptPayeeCode: string;
  fatcaExemptionCode: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  accountNumbers: string;
  tinType: W9TinType;
  tin: string;
  signatureName: string;
  certificationAccepted: boolean;
}

export interface PortalW9Summary {
  userId: string;
  legalName: string;
  businessName: string | null;
  taxClassification: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  tinType: W9TinType;
  signatureName: string;
  signedAt: string;
}

export const EMPTY_W9_FORM: PortalW9FormValues = {
  legalName: "",
  businessName: "",
  taxClass: "individual",
  llcClassification: "",
  hasForeignPartners: false,
  exemptPayeeCode: "",
  fatcaExemptionCode: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zip: "",
  accountNumbers: "",
  tinType: "ssn",
  tin: "",
  signatureName: "",
  certificationAccepted: false,
};

export const W9_TODO_SLUG = "w9_setup";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export { US_STATES };

function normalizeSsn(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function normalizeEin(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function formatTinInput(value: string, tinType: W9TinType): string {
  return tinType === "ssn" ? normalizeSsn(value) : normalizeEin(value);
}

export function getDefaultW9Values(user: User | null, profile?: { firstName: string; lastName: string } | null): PortalW9FormValues {
  const firstName = profile?.firstName?.trim()
    ?? (typeof user?.user_metadata?.first_name === "string" ? user.user_metadata.first_name.trim() : "");
  const lastName = profile?.lastName?.trim()
    ?? (typeof user?.user_metadata?.last_name === "string" ? user.user_metadata.last_name.trim() : "");
  const legalName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    ...EMPTY_W9_FORM,
    legalName,
    signatureName: legalName,
  };
}

export function validatePortalW9Form(values: PortalW9FormValues): string | null {
  if (!values.legalName.trim()) return "Line 1 — name is required.";
  if (!values.taxClass) return "Line 3a — federal tax classification is required.";
  if (values.taxClass === "llc" && !values.llcClassification) {
    return "Enter the LLC tax classification (C, S, or P).";
  }
  if (!values.addressLine1.trim()) return "Line 5 — address is required.";
  if (!values.city.trim()) return "Line 6 — city is required.";
  if (!/^[A-Z]{2}$/.test(values.state.trim().toUpperCase())) return "Line 6 — state must be a two-letter code.";
  if (!/^\d{5}(-\d{4})?$/.test(values.zip.trim())) return "Line 6 — enter a valid ZIP code.";
  if (!values.tin.trim()) return values.tinType === "ssn" ? "Part I — SSN is required." : "Part I — EIN is required.";
  const formattedTin = formatTinInput(values.tin, values.tinType);
  if (values.tinType === "ssn" && !/^\d{3}-\d{2}-\d{4}$/.test(formattedTin)) {
    return "Enter a valid SSN (111-22-3333).";
  }
  if (values.tinType === "ein" && !/^\d{2}-\d{7}$/.test(formattedTin)) {
    return "Enter a valid EIN (12-3456789).";
  }
  if (!values.signatureName.trim()) return "Part II — signature is required.";
  if (!values.certificationAccepted) return "You must certify the information under Part II.";
  return null;
}

export function getStoredTaxClassification(values: PortalW9FormValues): string {
  return taxClassToStoredLabel(values.taxClass as W9TaxClassOptionId, values.llcClassification);
}

interface PortalW9Row {
  user_id: string;
  legal_name: string;
  business_name: string | null;
  tax_classification: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  tin_type: W9TinType;
  signature_name: string;
  signed_at: string;
}

function mapPortalW9Summary(row: PortalW9Row): PortalW9Summary {
  return {
    userId: row.user_id,
    legalName: row.legal_name,
    businessName: row.business_name,
    taxClassification: row.tax_classification,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    tinType: row.tin_type,
    signatureName: row.signature_name,
    signedAt: row.signed_at,
  };
}

export async function fetchPortalW9(userId: string): Promise<PortalW9Summary | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_w9_forms")
    .select("user_id, legal_name, business_name, tax_classification, address_line1, address_line2, city, state, zip, tin_type, signature_name, signed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPortalW9Summary(data as PortalW9Row) : null;
}

export async function submitPortalW9(
  accessToken: string,
  values: PortalW9FormValues,
): Promise<PortalW9Summary> {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Portal authentication is not configured.");
  }

  const validationError = validatePortalW9Form(values);
  if (validationError) {
    throw new Error(validationError);
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/submit-portal-w9`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      legalName: values.legalName.trim(),
      businessName: values.businessName.trim() || null,
      taxClass: values.taxClass,
      llcClassification: values.taxClass === "llc" ? values.llcClassification || null : null,
      taxClassification: getStoredTaxClassification(values),
      addressLine1: values.addressLine1.trim(),
      addressLine2: values.addressLine2.trim() || null,
      city: values.city.trim(),
      state: values.state.trim().toUpperCase(),
      zip: values.zip.trim(),
      tinType: values.tinType,
      tin: formatTinInput(values.tin, values.tinType),
      signatureName: values.signatureName.trim(),
      certificationAccepted: values.certificationAccepted,
      hasForeignPartners: values.hasForeignPartners,
      exemptPayeeCode: values.exemptPayeeCode.trim() || null,
      fatcaExemptionCode: values.fatcaExemptionCode.trim() || null,
      accountNumbers: values.accountNumbers.trim() || null,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to submit W-9");
  }

  return data.w9 as PortalW9Summary;
}

export function isW9TodoComplete(user: User | null, w9Submitted: boolean): boolean {
  if (w9Submitted) return true;
  const completed = user?.user_metadata?.completed_portal_todos;
  if (!completed || typeof completed !== "object" || Array.isArray(completed)) {
    return false;
  }
  return (completed as Record<string, boolean>)[W9_TODO_SLUG] === true;
}
