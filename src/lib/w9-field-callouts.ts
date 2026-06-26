import { W9_FORM_FIELD_SUFFIXES, type W9FormFieldKey } from "@/lib/w9-form-fields";
import { W9_PDF_PAGES } from "@/lib/w9-form";

export interface W9FieldCalloutMeta {
  fieldKey: W9FormFieldKey;
  label: string;
  hint?: string;
  page: number;
}

export const W9_FIELD_CALLOUTS: W9FieldCalloutMeta[] = [
  {
    fieldKey: "legalName",
    label: "Legal name",
    page: W9_PDF_PAGES.form,
  },
  {
    fieldKey: "taxClassIndividual",
    label: "Tax classification",
    hint: "Check one box on line 3a",
    page: W9_PDF_PAGES.form,
  },
  {
    fieldKey: "addressLine1",
    label: "Address",
    page: W9_PDF_PAGES.form,
  },
  {
    fieldKey: "cityStateZip",
    label: "City, state, ZIP",
    hint: "Example: Scottsdale, AZ 85260",
    page: W9_PDF_PAGES.form,
  },
  {
    fieldKey: "ssnPart1",
    label: "Tax ID (SSN or EIN)",
    hint: "Complete Part I",
    page: W9_PDF_PAGES.form,
  },
];

export function calloutFieldSuffix(fieldKey: W9FormFieldKey): string {
  return W9_FORM_FIELD_SUFFIXES[fieldKey];
}
