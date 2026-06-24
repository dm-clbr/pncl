export const W9_STORED_TAX_CLASSIFICATIONS = [
  "Individual/sole proprietor",
  "C corporation",
  "S corporation",
  "Partnership",
  "Trust/estate",
  "Limited liability company (LLC) (C)",
  "Limited liability company (LLC) (S)",
  "Limited liability company (LLC) (P)",
  "Other (see instructions)",
] as const;

export type W9TinType = "ssn" | "ein";

export interface PortalW9FormValues {
  legalName: string;
  businessName: string;
  taxClassification: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  tinType: W9TinType;
  tin: string;
  signatureName: string;
  certificationAccepted: boolean;
  hasForeignPartners: boolean;
  exemptPayeeCode: string | null;
  fatcaExemptionCode: string | null;
  accountNumbers: string | null;
}

export interface SubmitPortalW9Payload {
  legalName: string;
  businessName?: string | null;
  taxClassification: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zip: string;
  tinType: W9TinType;
  tin: string;
  signatureName: string;
  certificationAccepted: boolean;
  hasForeignPartners?: boolean;
  exemptPayeeCode?: string | null;
  fatcaExemptionCode?: string | null;
  accountNumbers?: string | null;
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

export interface PortalW9Record {
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
  tin_encrypted: string;
  signature_name: string;
  signed_at: string;
  has_foreign_partners: boolean;
  exempt_payee_code: string | null;
  fatca_exemption_code: string | null;
  account_numbers: string | null;
  created_at: string;
  updated_at: string;
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalNullableText(value: unknown): string | null {
  const trimmed = optionalText(value);
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSsn(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 9) return value.trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function normalizeEin(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 9) return value.trim();
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function isValidSsn(value: string): boolean {
  return /^\d{3}-\d{2}-\d{4}$/.test(normalizeSsn(value));
}

function isValidEin(value: string): boolean {
  return /^\d{2}-\d{7}$/.test(normalizeEin(value));
}

export function validateSubmitPortalW9Payload(body: unknown): SubmitPortalW9Payload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const legalName = optionalText(data.legalName);
  if (!legalName) {
    throw new Error("Line 1 — name is required");
  }

  const taxClassification = optionalText(data.taxClassification);
  if (!W9_STORED_TAX_CLASSIFICATIONS.includes(taxClassification as typeof W9_STORED_TAX_CLASSIFICATIONS[number])) {
    throw new Error("Line 3a — federal tax classification is required");
  }

  const addressLine1 = optionalText(data.addressLine1);
  if (!addressLine1) {
    throw new Error("Line 5 — address is required");
  }

  const city = optionalText(data.city);
  if (!city) {
    throw new Error("Line 6 — city is required");
  }

  const state = optionalText(data.state).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error("Line 6 — state must be a two-letter code");
  }

  const zip = optionalText(data.zip);
  if (!/^\d{5}(-\d{4})?$/.test(zip)) {
    throw new Error("Line 6 — ZIP code must be 5 digits or ZIP+4");
  }

  const tinType = optionalText(data.tinType);
  if (tinType !== "ssn" && tinType !== "ein") {
    throw new Error("Part I — tax ID type is required");
  }

  const rawTin = optionalText(data.tin);
  const tin = tinType === "ssn" ? normalizeSsn(rawTin) : normalizeEin(rawTin);
  if (tinType === "ssn" ? !isValidSsn(tin) : !isValidEin(tin)) {
    throw new Error(tinType === "ssn"
      ? "Enter a valid SSN (111-22-3333)"
      : "Enter a valid EIN (12-3456789)");
  }

  const signatureName = optionalText(data.signatureName);
  if (!signatureName) {
    throw new Error("Part II — signature is required");
  }

  if (data.certificationAccepted !== true) {
    throw new Error("You must certify the information under Part II");
  }

  const businessName = optionalText(data.businessName);
  const addressLine2 = optionalText(data.addressLine2);
  const hasForeignPartners = data.hasForeignPartners === true;

  return {
    legalName,
    businessName: businessName || null,
    taxClassification,
    addressLine1,
    addressLine2: addressLine2 || null,
    city,
    state,
    zip,
    tinType,
    tin,
    signatureName,
    certificationAccepted: true,
    hasForeignPartners,
    exemptPayeeCode: optionalNullableText(data.exemptPayeeCode),
    fatcaExemptionCode: optionalNullableText(data.fatcaExemptionCode),
    accountNumbers: optionalNullableText(data.accountNumbers),
  };
}

export function mapPortalW9Summary(row: PortalW9Record): PortalW9Summary {
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

export function validatePortalW9Form(values: PortalW9FormValues): string | null {
  try {
    validateSubmitPortalW9Payload(values);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Please complete all required fields.";
  }
}
