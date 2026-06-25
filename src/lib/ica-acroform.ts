import type { PDFDocumentProxy } from "pdfjs-dist";
import { ICA_FORM_FIELDS, isValidDebitCheckInitial, normalizeDebitCheckInitial } from "@/lib/ica-form-fields";
import type { DebitCheckInitials } from "@/lib/onboarding-contract";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ExtractedIcaFormValues {
  legalName: string;
  personalEmail: string;
  signatureName: string;
  debitCheckInitials: DebitCheckInitials;
}

function storageValue(storageAll: Record<string, { value?: unknown }>, fieldId: string): string {
  const raw = storageAll[fieldId]?.value;
  if (raw == null) return "";
  return String(raw).trim();
}

function domValue(container: HTMLElement, fieldId: string): string {
  const el = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;
  if (!el) return "";
  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    return el.checked ? "Yes" : "";
  }
  return el.value.trim();
}

/** Sync DOM form inputs into PDF.js annotation storage before reading values. */
export async function syncIcaFormFieldsFromDom(
  container: HTMLElement,
  pdfDocument: PDFDocumentProxy,
): Promise<void> {
  const fieldObjects = await pdfDocument.getFieldObjects();
  if (!fieldObjects) return;

  const storage = pdfDocument.annotationStorage;

  for (const entries of Object.values(fieldObjects)) {
    const field = entries?.[0];
    if (!field?.id) continue;

    const el = container.querySelector(`#pdfjs_internal_id_${field.id}`) as HTMLInputElement | null;
    if (!el) continue;

    if (el.type === "checkbox") {
      storage.setValue(field.id, { value: el.checked });
    } else {
      storage.setValue(field.id, { value: el.value });
    }
  }
}

function readNamedField(
  fieldName: string,
  fieldObjects: NonNullable<Awaited<ReturnType<PDFDocumentProxy["getFieldObjects"]>>>,
  storageAll: Record<string, { value?: unknown }>,
  container: HTMLElement,
): string {
  const entry = fieldObjects[fieldName]?.[0];
  if (!entry) return "";

  const fromStorage = storageValue(storageAll, entry.id);
  if (fromStorage) return fromStorage;

  const fromDom = domValue(container, entry.id);
  if (fromDom) return fromDom;

  return String(entry.value ?? "").trim();
}

export async function extractIcaFormValues(
  pdfDocument: PDFDocumentProxy,
  container: HTMLElement,
  signatureImage?: string | null,
): Promise<ExtractedIcaFormValues> {
  await syncIcaFormFieldsFromDom(container, pdfDocument);

  const fieldObjects = await pdfDocument.getFieldObjects();
  if (!fieldObjects) {
    throw new Error("This agreement PDF has no fillable fields.");
  }

  const storageAll = pdfDocument.annotationStorage.getAll() as Record<string, { value?: unknown }>;

  const legalName =
    readNamedField(ICA_FORM_FIELDS.fullName, fieldObjects, storageAll, container) ||
    readNamedField(ICA_FORM_FIELDS.introName, fieldObjects, storageAll, container);

  const personalEmail = readNamedField(ICA_FORM_FIELDS.email, fieldObjects, storageAll, container);
  const signatureName = signatureImage
    ? legalName
    : readNamedField(ICA_FORM_FIELDS.signature, fieldObjects, storageAll, container);

  const debitCheckInitials: DebitCheckInitials = {
    a: normalizeDebitCheckInitial(
      readNamedField(ICA_FORM_FIELDS.initialA, fieldObjects, storageAll, container),
    ),
    b: normalizeDebitCheckInitial(
      readNamedField(ICA_FORM_FIELDS.initialB, fieldObjects, storageAll, container),
    ),
    c: normalizeDebitCheckInitial(
      readNamedField(ICA_FORM_FIELDS.initialC, fieldObjects, storageAll, container),
    ),
    d: normalizeDebitCheckInitial(
      readNamedField(ICA_FORM_FIELDS.initialD, fieldObjects, storageAll, container),
    ),
    e: normalizeDebitCheckInitial(
      readNamedField(ICA_FORM_FIELDS.initialE, fieldObjects, storageAll, container),
    ),
  };

  return { legalName, personalEmail, signatureName, debitCheckInitials };
}

export function validateExtractedIcaFormValues(
  values: ExtractedIcaFormValues,
  signatureImage?: string | null,
): string | null {
  if (!values.legalName.trim()) {
    return "Enter your full legal name on the signature page.";
  }
  if (!values.personalEmail.trim()) {
    return "Enter your email address on the signature page.";
  }
  if (!EMAIL_PATTERN.test(values.personalEmail.trim())) {
    return "Enter a valid email address on the signature page.";
  }

  if (signatureImage) {
    if (!signatureImage.startsWith("data:image/png")) {
      return "Draw a valid signature on the Debit-Check page.";
    }
  } else if (!values.signatureName.trim()) {
    return "Draw your signature on the agreement.";
  } else if (
    values.legalName.trim().localeCompare(values.signatureName.trim(), undefined, {
      sensitivity: "accent",
    }) !== 0
  ) {
    return "Your signature must match your legal name exactly.";
  }

  for (const [key, initial] of Object.entries(values.debitCheckInitials) as [keyof DebitCheckInitials, string][]) {
    if (!isValidDebitCheckInitial(initial)) {
      return `Enter initials for statement ${key.toUpperCase()} on the Debit-Check page (letters only, up to 20 characters).`;
    }
  }

  return null;
}
