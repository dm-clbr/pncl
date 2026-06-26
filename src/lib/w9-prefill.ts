import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  getW9FieldEntry,
  W9_FORM_FIELD_SUFFIXES,
  type W9ResolvedFieldObjects,
} from "@/lib/w9-form-fields";
import { W9_REQUESTER } from "@/lib/w9-content";

export interface W9PrefillInput {
  legalName?: string;
}

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function requesterText(): string {
  return [W9_REQUESTER.name, W9_REQUESTER.addressLine1, W9_REQUESTER.cityStateZip].join("\n");
}

async function setFieldValue(
  pdfDocument: PDFDocumentProxy,
  container: HTMLElement,
  fieldObjects: W9ResolvedFieldObjects,
  suffix: string,
  value: string,
): Promise<void> {
  const entry = Object.entries(fieldObjects).find(
    ([name]) => name === suffix || name.endsWith(`.${suffix}`) || name.endsWith(suffix),
  )?.[1]?.[0];

  if (!entry?.id) return;

  pdfDocument.annotationStorage.setValue(entry.id, { value });

  const el = container.querySelector(`#pdfjs_internal_id_${entry.id}`) as HTMLInputElement | null;
  if (el && el.type !== "checkbox") {
    el.value = value;
  }
}

export async function prefillW9Fields(
  pdfDocument: PDFDocumentProxy,
  container: HTMLElement,
  input: W9PrefillInput,
): Promise<void> {
  const fieldObjects = (await pdfDocument.getFieldObjects()) as W9ResolvedFieldObjects | null;
  if (!fieldObjects) return;

  const legalName = input.legalName?.trim() ?? "";
  if (legalName) {
    await setFieldValue(pdfDocument, container, fieldObjects, W9_FORM_FIELD_SUFFIXES.legalName, legalName);
  }

  await setFieldValue(
    pdfDocument,
    container,
    fieldObjects,
    W9_FORM_FIELD_SUFFIXES.requester,
    requesterText(),
  );
  await setFieldValue(
    pdfDocument,
    container,
    fieldObjects,
    W9_FORM_FIELD_SUFFIXES.signatureDate,
    formatToday(),
  );

  const requesterEntry = getW9FieldEntry(fieldObjects, "requester");
  if (requesterEntry?.id) {
    const el = container.querySelector(`#pdfjs_internal_id_${requesterEntry.id}`) as HTMLInputElement | null;
    if (el) {
      el.readOnly = true;
      el.tabIndex = -1;
    }
  }
}

export async function refreshW9SignatureDate(
  pdfDocument: PDFDocumentProxy,
  container: HTMLElement,
): Promise<void> {
  const fieldObjects = (await pdfDocument.getFieldObjects()) as W9ResolvedFieldObjects | null;
  if (!fieldObjects) return;

  await setFieldValue(
    pdfDocument,
    container,
    fieldObjects,
    W9_FORM_FIELD_SUFFIXES.signatureDate,
    formatToday(),
  );
}
