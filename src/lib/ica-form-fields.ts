/** AcroForm field names in pncl-ica-standard.pdf (prepared in Acrobat). */
export const ICA_FORM_FIELDS = {
  day: "day",
  month: "month",
  yearLast2: "last-2-digit-year",
  introName: "Name",
  introDate: "todays-date",
  fullName: "full-name",
  email: "email-address",
  signatureDate: "date",
  signature: "signature",
  agentName: "agent-name",
  initialA: "a-initial",
  initialB: "b-initial",
  initialC: "c-initial",
  initialD: "d-initial",
  initialE: "e-initial",
} as const;

export type IcaFormFieldName = (typeof ICA_FORM_FIELDS)[keyof typeof ICA_FORM_FIELDS];

export const ICA_DEBIT_CHECK_INITIAL_MAX_LENGTH = 20;

export const ICA_DEBIT_CHECK_INITIAL_FIELD_NAMES = [
  ICA_FORM_FIELDS.initialA,
  ICA_FORM_FIELDS.initialB,
  ICA_FORM_FIELDS.initialC,
  ICA_FORM_FIELDS.initialD,
  ICA_FORM_FIELDS.initialE,
] as const;

export function normalizeDebitCheckInitial(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidDebitCheckInitial(value: string): boolean {
  const text = normalizeDebitCheckInitial(value);
  return (
    text.length >= 1 &&
    text.length <= ICA_DEBIT_CHECK_INITIAL_MAX_LENGTH &&
    /^[A-Z]+$/.test(text)
  );
}
