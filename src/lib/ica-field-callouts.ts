import { ICA_FORM_FIELDS, type IcaFormFieldName } from "@/lib/ica-form-fields";
import { ICA_PDF_PAGES } from "@/lib/onboarding-contract";

export interface IcaFieldCalloutMeta {
  fieldName: IcaFormFieldName;
  label: string;
  hint?: string;
  /** 1-based page in the ICA PDF */
  page: number;
}

/** User-owned fields only — dates and agent name are prefilled server-side. */
export const ICA_FIELD_CALLOUTS: IcaFieldCalloutMeta[] = [
  {
    fieldName: ICA_FORM_FIELDS.fullName,
    label: "Full legal name",
    page: ICA_PDF_PAGES.signature,
  },
  {
    fieldName: ICA_FORM_FIELDS.email,
    label: "Email address",
    page: ICA_PDF_PAGES.signature,
  },
  {
    fieldName: ICA_FORM_FIELDS.signature,
    label: "Signature",
    hint: "Click to draw your signature",
    page: ICA_PDF_PAGES.debitCheck,
  },
  {
    fieldName: ICA_FORM_FIELDS.initialA,
    label: "Initial (A)",
    hint: "Debit-Check statement A",
    page: ICA_PDF_PAGES.debitCheck,
  },
  {
    fieldName: ICA_FORM_FIELDS.initialB,
    label: "Initial (B)",
    hint: "Debit-Check statement B",
    page: ICA_PDF_PAGES.debitCheck,
  },
  {
    fieldName: ICA_FORM_FIELDS.initialC,
    label: "Initial (C)",
    hint: "Debit-Check statement C",
    page: ICA_PDF_PAGES.debitCheck,
  },
  {
    fieldName: ICA_FORM_FIELDS.initialD,
    label: "Initial (D)",
    hint: "Debit-Check statement D",
    page: ICA_PDF_PAGES.debitCheck,
  },
  {
    fieldName: ICA_FORM_FIELDS.initialE,
    label: "Initial (E)",
    hint: "Debit-Check statement E",
    page: ICA_PDF_PAGES.debitCheck,
  },
];

export const ICA_FIELD_CALLOUT_BY_NAME = Object.fromEntries(
  ICA_FIELD_CALLOUTS.map((callout) => [callout.fieldName, callout]),
) as Partial<Record<IcaFormFieldName, IcaFieldCalloutMeta>>;
