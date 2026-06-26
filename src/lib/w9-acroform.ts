import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  getW9FieldEntry,
  resolveW9FieldName,
  W9_FORM_FIELD_SUFFIXES,
  W9_TAX_CLASS_CHECKBOX_KEYS,
  W9_TAX_CLASS_KEY_TO_OPTION_ID,
  type W9FormFieldKey,
  type W9ResolvedFieldObjects,
} from "@/lib/w9-form-fields";
import {
  taxClassToStoredLabel,
  type W9LlcClassification,
  type W9TaxClassOptionId,
} from "@/lib/w9-content";
import { formatTinInput, type W9TinType } from "@/lib/portal-w9";

export interface ExtractedW9FormValues {
  legalName: string;
  businessName: string;
  taxClass: W9TaxClassOptionId | "";
  llcClassification: W9LlcClassification | "";
  hasForeignPartners: boolean;
  exemptPayeeCode: string;
  fatcaExemptionCode: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  accountNumbers: string;
  tinType: W9TinType;
  tin: string;
  signatureName: string;
}

function storageValue(storageAll: Record<string, { value?: unknown }>, fieldId: string): string {
  const raw = storageAll[fieldId]?.value;
  if (raw == null) return "";
  if (typeof raw === "boolean") return raw ? "Yes" : "";
  return String(raw).trim();
}

function domValue(container: HTMLElement, fieldId: string): string {
  const el = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as HTMLInputElement | null;
  if (el) {
    if (el.type === "checkbox") return el.checked ? "Yes" : "";
    return el.value.trim();
  }

  // Some widgets render without the pdfjs_internal_id prefix in certain pdf.js builds.
  const fallback = container.querySelector(
    `[data-element-id="${fieldId}"], [id="${fieldId}"]`,
  ) as HTMLInputElement | null;
  if (!fallback) return "";
  if (fallback.type === "checkbox") return fallback.checked ? "Yes" : "";
  return fallback.value.trim();
}

export async function syncW9FormFieldsFromDom(
  container: HTMLElement,
  pdfDocument: PDFDocumentProxy,
): Promise<void> {
  const fieldObjects = await pdfDocument.getFieldObjects();
  if (!fieldObjects) return;

  const storage = pdfDocument.annotationStorage;

  for (const entries of Object.values(fieldObjects)) {
    const field = entries?.[0];
    if (!field?.id) continue;

    const el = container.querySelector(`#pdfjs_internal_id_${field.id}`) as HTMLInputElement | null
      ?? container.querySelector(`[data-element-id="${field.id}"], [id="${field.id}"]`) as HTMLInputElement | null;
    if (!el) continue;

    if (el.type === "checkbox") {
      storage.setValue(field.id, { value: el.checked });
    } else {
      storage.setValue(field.id, { value: el.value });
    }
  }
}

function readTextField(
  key: W9FormFieldKey,
  fieldObjects: W9ResolvedFieldObjects,
  storageAll: Record<string, { value?: unknown }>,
  container: HTMLElement,
): string {
  const entry = getW9FieldEntry(fieldObjects, key);
  if (!entry) return "";

  const fromStorage = storageValue(storageAll, entry.id);
  if (fromStorage) return fromStorage;

  const fromDom = domValue(container, entry.id);
  if (fromDom) return fromDom;

  return String(entry.value ?? "").trim();
}

function readCheckbox(
  key: W9FormFieldKey,
  fieldObjects: W9ResolvedFieldObjects,
  storageAll: Record<string, { value?: unknown }>,
  container: HTMLElement,
): boolean {
  const entry = getW9FieldEntry(fieldObjects, key);
  if (!entry) return false;

  const fromStorage = storageAll[entry.id]?.value;
  if (typeof fromStorage === "boolean") return fromStorage;

  const fromDom = domValue(container, entry.id);
  if (fromDom) return true;

  return Boolean(entry.value);
}

export function parseCityStateZip(value: string): { city: string; state: string; zip: string } {
  const trimmed = value.trim();
  if (!trimmed) return { city: "", state: "", zip: "" };

  const zipMatch = trimmed.match(/(\d{5}(?:-\d{4})?)\s*$/);
  const zip = zipMatch?.[1] ?? "";
  const withoutZip = zip ? trimmed.slice(0, trimmed.length - zip.length).trim().replace(/[,\s]+$/, "") : trimmed;

  const stateMatch = withoutZip.match(/(?:,\s*|\s+)([A-Z]{2})\s*$/i);
  const state = stateMatch?.[1]?.toUpperCase() ?? "";
  const city = stateMatch ? withoutZip.slice(0, withoutZip.length - stateMatch[0].length).trim().replace(/,\s*$/, "") : withoutZip;

  return { city, state, zip };
}

function readTin(fieldObjects: W9ResolvedFieldObjects, storageAll: Record<string, { value?: unknown }>, container: HTMLElement): {
  tinType: W9TinType;
  tin: string;
} {
  const ssn = [
    readTextField("ssnPart1", fieldObjects, storageAll, container),
    readTextField("ssnPart2", fieldObjects, storageAll, container),
    readTextField("ssnPart3", fieldObjects, storageAll, container),
  ].join("").replace(/\D/g, "");

  const ein = [
    readTextField("einPart1", fieldObjects, storageAll, container),
    readTextField("einPart2", fieldObjects, storageAll, container),
  ].join("").replace(/\D/g, "");

  if (ein.length >= ssn.length && ein.length > 0) {
    return { tinType: "ein", tin: formatTinInput(ein, "ein") };
  }
  if (ssn.length > 0) {
    return { tinType: "ssn", tin: formatTinInput(ssn, "ssn") };
  }

  return { tinType: "ssn", tin: "" };
}

function readTaxClass(fieldObjects: W9ResolvedFieldObjects, storageAll: Record<string, { value?: unknown }>, container: HTMLElement): {
  taxClass: W9TaxClassOptionId | "";
  llcClassification: W9LlcClassification | "";
} {
  for (const key of W9_TAX_CLASS_CHECKBOX_KEYS) {
    if (readCheckbox(key, fieldObjects, storageAll, container)) {
      const taxClass = W9_TAX_CLASS_KEY_TO_OPTION_ID[key];
      const llcClassification = taxClass === "llc"
        ? (readTextField("llcClassification", fieldObjects, storageAll, container).toUpperCase() as W9LlcClassification)
        : "";
      return { taxClass, llcClassification: llcClassification === "C" || llcClassification === "S" || llcClassification === "P" ? llcClassification : "" };
    }
  }

  return { taxClass: "", llcClassification: "" };
}

export async function extractW9FormValues(
  pdfDocument: PDFDocumentProxy,
  container: HTMLElement,
): Promise<ExtractedW9FormValues> {
  await syncW9FormFieldsFromDom(container, pdfDocument);

  const fieldObjects = (await pdfDocument.getFieldObjects()) as W9ResolvedFieldObjects | null;
  if (!fieldObjects) {
    throw new Error("This W-9 PDF has no fillable fields.");
  }

  const storageAll = pdfDocument.annotationStorage.getAll() as Record<string, { value?: unknown }>;
  const legalName = readTextField("legalName", fieldObjects, storageAll, container);
  const { taxClass, llcClassification } = readTaxClass(fieldObjects, storageAll, container);
  const { tinType, tin } = readTin(fieldObjects, storageAll, container);
  const cityStateZip = readTextField("cityStateZip", fieldObjects, storageAll, container);
  const parsed = parseCityStateZip(cityStateZip);

  return {
    legalName,
    businessName: readTextField("businessName", fieldObjects, storageAll, container),
    taxClass,
    llcClassification,
    hasForeignPartners: readCheckbox("hasForeignPartners", fieldObjects, storageAll, container),
    exemptPayeeCode: readTextField("exemptPayeeCode", fieldObjects, storageAll, container),
    fatcaExemptionCode: readTextField("fatcaExemptionCode", fieldObjects, storageAll, container),
    addressLine1: readTextField("addressLine1", fieldObjects, storageAll, container),
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    accountNumbers: readTextField("accountNumbers", fieldObjects, storageAll, container),
    tinType,
    tin,
    signatureName: legalName,
  };
}

export function validateExtractedW9FormValues(
  values: ExtractedW9FormValues,
  certificationAccepted?: boolean,
): string | null {
  if (!values.legalName.trim()) return "Line 1 — name is required.";
  if (!values.taxClass) return "Line 3a — federal tax classification is required.";

  if (values.taxClass === "llc" && !values.llcClassification) {
    return "Enter the LLC tax classification (C, S, or P).";
  }

  if (!values.addressLine1.trim()) return "Line 5 — address is required.";
  if (!values.city.trim()) return "Line 6 — city is required.";
  if (!/^[A-Z]{2}$/.test(values.state.trim())) return "Line 6 — state must be a two-letter code.";
  if (!/^\d{5}(-\d{4})?$/.test(values.zip.trim())) return "Line 6 — enter a valid ZIP code.";

  if (!values.tin.trim()) {
    return values.tinType === "ssn" ? "Part I — SSN is required." : "Part I — EIN is required.";
  }
  if (values.tinType === "ssn" && !/^\d{3}-\d{2}-\d{4}$/.test(values.tin)) {
    return "Enter a valid SSN (111-22-3333).";
  }
  if (values.tinType === "ein" && !/^\d{2}-\d{7}$/.test(values.tin)) {
    return "Enter a valid EIN (12-3456789).";
  }

  if (!certificationAccepted) return "You must certify the information under Part II.";

  return null;
}

export function extractedToSubmitPayload(
  values: ExtractedW9FormValues,
  certificationAccepted: boolean,
) {
  return {
    legalName: values.legalName.trim(),
    businessName: values.businessName.trim() || null,
    taxClass: values.taxClass as W9TaxClassOptionId,
    llcClassification: values.taxClass === "llc" ? values.llcClassification || null : null,
    taxClassification: taxClassToStoredLabel(values.taxClass, values.llcClassification),
    addressLine1: values.addressLine1.trim(),
    addressLine2: null,
    city: values.city.trim(),
    state: values.state.trim().toUpperCase(),
    zip: values.zip.trim(),
    tinType: values.tinType,
    tin: values.tin,
    signatureName: values.legalName.trim(),
    signatureImageBase64: "",
    certificationAccepted,
    hasForeignPartners: values.hasForeignPartners,
    exemptPayeeCode: values.exemptPayeeCode.trim() || null,
    fatcaExemptionCode: values.fatcaExemptionCode.trim() || null,
    accountNumbers: values.accountNumbers.trim() || null,
  };
}

/** Ensure all interactive fields on page 1 are mounted in the DOM. */
export async function listW9FieldNames(fieldObjects: W9ResolvedFieldObjects): Promise<string[]> {
  return Object.keys(fieldObjects).filter((name) => {
    return Object.values(W9_FORM_FIELD_SUFFIXES).some(
      (suffix) => name === suffix || name.endsWith(`.${suffix}`) || name.endsWith(suffix),
    );
  });
}

export { resolveW9FieldName };
