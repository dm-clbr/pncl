export const ICA_PDF_URL = "/documents/pncl-ica-standard.pdf";
export const ICA_TOTAL_PAGES = 14;

/** 1-based page numbers in the PNCL ICA PDF. */
export const ICA_PDF_PAGES = {
  introduction: 2,
  counsel: 10,
  signature: 12,
  debitCheck: 14,
} as const;

/** Pages that contain AcroForm fields the user must complete. */
export const ICA_FIELD_PAGES = [
  ICA_PDF_PAGES.introduction,
  ICA_PDF_PAGES.signature,
  ICA_PDF_PAGES.debitCheck,
] as const;

/**
 * AcroForm field names in pncl-ica-standard.pdf — filled server-side on submit.
 * @see supabase/functions/_shared/icaFormFields.ts
 */
export const ICA_ACROFORM_FIELD_NAMES = [
  "day",
  "month",
  "last-2-digit-year",
  "Name",
  "todays-date",
  "full-name",
  "email-address",
  "date",
  "signature",
  "agent-name",
  "a-initial",
  "b-initial",
  "c-initial",
  "d-initial",
  "e-initial",
] as const;

export const CONTRACT_SESSION_KEY = "pncl_onboarding_contract_id";
export const CONTRACT_NAME_SESSION_KEY = "pncl_onboarding_contract_legal_name";
export const CONTRACT_EMAIL_SESSION_KEY = "pncl_onboarding_contract_email";

export const PREVIEW_CONTRACT_SESSION_KEY = "pncl_preview_onboarding_contract_id";
export const PREVIEW_CONTRACT_NAME_SESSION_KEY = "pncl_preview_onboarding_contract_legal_name";
export const PREVIEW_CONTRACT_EMAIL_SESSION_KEY = "pncl_preview_onboarding_contract_email";

export interface DebitCheckInitials {
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
}

export interface SubmitOnboardingContractInput {
  legalName: string;
  personalEmail: string;
  signatureName: string;
  signatureImageBase64: string;
  debitCheckInitials: DebitCheckInitials;
  agreementAccepted: boolean;
  counselAcknowledged: boolean;
}

export interface OnboardingContractSummary {
  id: string;
  legalName: string;
  personalEmail: string;
  signatureName: string;
  icaVersion: string;
  signedAt: string;
  pdfPath: string;
}

export interface SubmitOnboardingContractResponse {
  contractSignatureId: string;
  contract: OnboardingContractSummary;
  message: string;
}

export const DEBIT_CHECK_STATEMENTS = [
  {
    key: "a" as const,
    label: "(A)",
    text: "Authorize PNCL to use my information for commission-related debit balance screening.",
  },
  {
    key: "b" as const,
    label: "(B)",
    text: "Authorize PNCL to consider screening results for contracting, appointment, or commission advancement.",
  },
  {
    key: "c" as const,
    label: "(C)",
    text: "Authorize Vector One to disclose screening results to PNCL.",
  },
  {
    key: "d" as const,
    label: "(D)",
    text: "Authorize PNCL to submit my information to Debit-Check if a debit balance is owed upon termination.",
  },
  {
    key: "e" as const,
    label: "(E)",
    text: "Authorize Vector One to disclose screening results to Debit-Check subscribers if a debit balance is owed.",
  },
];

function contractSessionKeys(preview: boolean) {
  if (preview) {
    return {
      id: PREVIEW_CONTRACT_SESSION_KEY,
      name: PREVIEW_CONTRACT_NAME_SESSION_KEY,
      email: PREVIEW_CONTRACT_EMAIL_SESSION_KEY,
    };
  }

  return {
    id: CONTRACT_SESSION_KEY,
    name: CONTRACT_NAME_SESSION_KEY,
    email: CONTRACT_EMAIL_SESSION_KEY,
  };
}

export function readStoredContractSignatureId(preview = false): string | null {
  try {
    return sessionStorage.getItem(contractSessionKeys(preview).id);
  } catch {
    return null;
  }
}

export function persistContractSession(
  contractSignatureId: string,
  legalName: string,
  personalEmail: string,
  preview = false,
): void {
  try {
    const keys = contractSessionKeys(preview);
    sessionStorage.setItem(keys.id, contractSignatureId);
    sessionStorage.setItem(keys.name, legalName);
    sessionStorage.setItem(keys.email, personalEmail);
  } catch {
    // Ignore storage failures; onboarding can still proceed in-memory.
  }
}

export function clearStoredContractSession(preview = false): void {
  try {
    const keys = contractSessionKeys(preview);
    sessionStorage.removeItem(keys.id);
    sessionStorage.removeItem(keys.name);
    sessionStorage.removeItem(keys.email);
  } catch {
    // Ignore.
  }
}

export function readStoredContractLegalName(preview = false): string | null {
  try {
    return sessionStorage.getItem(contractSessionKeys(preview).name);
  } catch {
    return null;
  }
}

export function clearAllPreviewContractSessions(): void {
  clearStoredContractSession(true);
}
