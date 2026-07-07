import type { PDFDocumentProxy } from "pdfjs-dist";
import { ICA_FORM_FIELDS } from "@/lib/ica-form-fields";
import { formatIcaEffectiveDate } from "@/lib/ica-date-format";

function setFieldValue(
  pdfDocument: PDFDocumentProxy,
  container: HTMLElement,
  fieldId: string,
  value: string,
): void {
  pdfDocument.annotationStorage.setValue(fieldId, { value });

  const el = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as HTMLInputElement | null;
  if (el && el.value !== value) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export interface IcaPrefillOptions {
  legalName?: string;
  email?: string;
}

/** Prefill date fields and mirror legal name into duplicate PDF name fields. */
export async function prefillIcaServerFields(
  pdfDocument: PDFDocumentProxy,
  container: HTMLElement,
  options: IcaPrefillOptions = {},
): Promise<void> {
  const fieldObjects = await pdfDocument.getFieldObjects();
  if (!fieldObjects) return;

  const legalName = options.legalName?.trim() ?? "";
  const email = options.email?.trim() ?? "";
  const dateParts = formatIcaEffectiveDate(new Date());

  const assignments: [string, string][] = [
    [ICA_FORM_FIELDS.day, dateParts.day],
    [ICA_FORM_FIELDS.month, dateParts.month],
    [ICA_FORM_FIELDS.yearLast2, dateParts.yearLast2],
    [ICA_FORM_FIELDS.signatureDate, dateParts.full],
    [ICA_FORM_FIELDS.introName, legalName],
    [ICA_FORM_FIELDS.agentName, legalName],
    [ICA_FORM_FIELDS.fullName, legalName],
    [ICA_FORM_FIELDS.email, email],
  ];

  for (const [fieldName, value] of assignments) {
    const entry = fieldObjects[fieldName]?.[0];
    if (!entry?.id || !value) continue;
    setFieldValue(pdfDocument, container, entry.id, value);
  }
}

/** Keep page-2 Name and page-14 agent-name in sync with full-name as the user types. */
export async function syncIcaMirroredNameFields(
  pdfDocument: PDFDocumentProxy,
  container: HTMLElement,
  legalName: string,
): Promise<void> {
  const fieldObjects = await pdfDocument.getFieldObjects();
  if (!fieldObjects) return;

  for (const fieldName of [ICA_FORM_FIELDS.introName, ICA_FORM_FIELDS.agentName]) {
    const entry = fieldObjects[fieldName]?.[0];
    if (!entry?.id) continue;
    setFieldValue(pdfDocument, container, entry.id, legalName);
  }
}
