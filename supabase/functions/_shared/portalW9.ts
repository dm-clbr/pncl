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

export const W9_TAX_CLASS_OPTIONS = [
  { id: "individual", label: "Individual/sole proprietor" },
  { id: "c_corp", label: "C corporation" },
  { id: "s_corp", label: "S corporation" },
  { id: "partnership", label: "Partnership" },
  { id: "trust_estate", label: "Trust/estate" },
  { id: "llc", label: "Limited liability company (LLC)" },
  { id: "other", label: "Other (see instructions)" },
] as const;

export type W9TaxClassOptionId = (typeof W9_TAX_CLASS_OPTIONS)[number]["id"];
export type W9LlcClassification = "C" | "S" | "P";

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
  taxClass: W9TaxClassOptionId;
  llcClassification?: W9LlcClassification | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zip: string;
  tinType: W9TinType;
  tin: string;
  signatureName: string;
  signatureImageBase64: string;
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
  pdfPath: string | null;
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
  pdf_path: string | null;
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

function isW9TaxClassOptionId(value: string): value is W9TaxClassOptionId {
  return W9_TAX_CLASS_OPTIONS.some((option) => option.id === value);
}

function isW9LlcClassification(value: string): value is W9LlcClassification {
  return value === "C" || value === "S" || value === "P";
}

export function taxClassToStoredLabel(
  taxClass: W9TaxClassOptionId,
  llcClassification: W9LlcClassification | "",
): string {
  const option = W9_TAX_CLASS_OPTIONS.find((item) => item.id === taxClass);
  if (!option) return "";
  if (taxClass === "llc" && llcClassification) {
    return `${option.label} (${llcClassification})`;
  }
  return option.label;
}

function resolveTaxClassification(data: Record<string, unknown>): string {
  const taxClass = optionalText(data.taxClass);
  if (taxClass) {
    if (!isW9TaxClassOptionId(taxClass)) {
      throw new Error("Line 3a — federal tax classification is required");
    }
    if (taxClass === "llc") {
      const llcClassification = optionalText(data.llcClassification);
      if (!isW9LlcClassification(llcClassification)) {
        throw new Error("Enter the LLC tax classification (C, S, or P)");
      }
      return taxClassToStoredLabel(taxClass, llcClassification);
    }
    return taxClassToStoredLabel(taxClass, "");
  }

  const taxClassification = optionalText(data.taxClassification);
  if (taxClassification === "Limited liability company (LLC)") {
    throw new Error("Enter the LLC tax classification (C, S, or P)");
  }
  if (!W9_STORED_TAX_CLASSIFICATIONS.includes(taxClassification as typeof W9_STORED_TAX_CLASSIFICATIONS[number])) {
    throw new Error("Line 3a — federal tax classification is required");
  }
  return taxClassification;
}

function normalizeSignatureImageBase64(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A drawn signature is required");
  }

  const trimmed = value.trim();
  const base64 = trimmed.includes(",") ? trimmed.split(",").pop() ?? "" : trimmed;
  if (!base64 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) {
    throw new Error("A valid drawn signature is required");
  }

  return trimmed;
}

export function storedLabelToTaxClass(stored: string): {
  taxClass: W9TaxClassOptionId;
  llcClassification: W9LlcClassification | "";
} {
  const llcMatch = stored.match(/^Limited liability company \(LLC\) \(([CSP])\)$/);
  if (llcMatch) {
    return { taxClass: "llc", llcClassification: llcMatch[1] as W9LlcClassification };
  }

  const found = W9_TAX_CLASS_OPTIONS.find((item) => item.label === stored);
  if (found) {
    return { taxClass: found.id, llcClassification: "" };
  }

  return { taxClass: "individual", llcClassification: "" };
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

  const taxClassification = resolveTaxClassification(data);
  const taxClass = optionalText(data.taxClass);
  const llcClassification = optionalText(data.llcClassification);

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

  const signatureImageBase64 = normalizeSignatureImageBase64(data.signatureImageBase64);

  if (legalName.localeCompare(signatureName, undefined, { sensitivity: "accent" }) !== 0) {
    throw new Error("Signature must match your legal name exactly");
  }

  if (data.certificationAccepted !== true) {
    throw new Error("You must certify the information under Part II");
  }

  const businessName = optionalText(data.businessName);
  const addressLine2 = optionalText(data.addressLine2);
  const hasForeignPartners = data.hasForeignPartners === true;
  const resolvedTaxClass = isW9TaxClassOptionId(taxClass)
    ? taxClass
    : storedLabelToTaxClass(taxClassification).taxClass;

  return {
    legalName,
    businessName: businessName || null,
    taxClassification,
    taxClass: resolvedTaxClass,
    llcClassification: isW9LlcClassification(llcClassification) ? llcClassification : null,
    addressLine1,
    addressLine2: addressLine2 || null,
    city,
    state,
    zip,
    tinType,
    tin,
    signatureName,
    signatureImageBase64,
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
    pdfPath: row.pdf_path,
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
