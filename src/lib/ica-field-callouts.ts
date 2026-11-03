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
    label: "Full first & last name",
    page: ICA_PDF_PAGES.signature,
  },
  {
    fieldName: ICA_FORM_FIELDS.email,
    label: "Email address",
    page: ICA_PDF_PAGES.signature,
  },
  {
    fieldName: ICA_FORM_FIELDS.executionSignature,
    label: "Signature",
    hint: "Draw your full first and last name",
    page: ICA_PDF_PAGES.signature,
  },
  {
    fieldName: ICA_FORM_FIELDS.signature,
    label: "Signature",
    hint: "Draw your full first and last name",
    page: ICA_PDF_PAGES.debitCheck,
  },
  {
    fieldName: ICA_FORM_FIELDS.initialA,
    label: "Your initials (A)",
    hint: "Your initials, not the letter A",
    page: ICA_PDF_PAGES.debitCheck,
  },
  {
    fieldName: ICA_FORM_FIELDS.initialB,
    label: "Your initials (B)",
    hint: "Your initials, not the letter B",
    page: ICA_PDF_PAGES.debitCheck,
  },
  {
    fieldName: ICA_FORM_FIELDS.initialC,
    label: "Your initials (C)",
    hint: "Your initials, not the letter C",
    page: ICA_PDF_PAGES.debitCheck,
  },
  {
    fieldName: ICA_FORM_FIELDS.initialD,
    label: "Your initials (D)",
    hint: "Your initials, not the letter D",
    page: ICA_PDF_PAGES.debitCheck,
  },
  {
    fieldName: ICA_FORM_FIELDS.initialE,
    label: "Your initials (E)",
    hint: "Your initials, not the letter E",
    page: ICA_PDF_PAGES.debitCheck,
  },
];

export const ICA_FIELD_CALLOUT_BY_NAME = Object.fromEntries(
  ICA_FIELD_CALLOUTS.map((callout) => [callout.fieldName, callout]),
) as Partial<Record<IcaFormFieldName, IcaFieldCalloutMeta>>;
