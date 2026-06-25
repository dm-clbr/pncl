/** AcroForm field names in pncl-ica-standard.pdf (prepared in Acrobat). */
export const ICA_FORM_FIELDS = {
  /** Page 1 — effective date parts */
  day: "day",
  month: "month",
  yearLast2: "last-2-digit-year",
  introName: "Name",
  introDate: "todays-date",
  /** Signature page */
  fullName: "full-name",
  email: "email-address",
  signatureDate: "date",
  signature: "signature",
  /** Debit-Check page */
  agentName: "agent-name",
  initialA: "a-initial",
  initialB: "b-initial",
  initialC: "c-initial",
  initialD: "d-initial",
  initialE: "e-initial",
} as const;

export type IcaFormFieldName = (typeof ICA_FORM_FIELDS)[keyof typeof ICA_FORM_FIELDS];

export const ICA_DEBIT_CHECK_INITIAL_MAX_LENGTH = 20;

export function normalizeDebitCheckInitial(value: string): string {
  return value.trim().toUpperCase();
}

export function assertValidDebitCheckInitial(value: string, field: string): string {
  const text = normalizeDebitCheckInitial(value);
  if (
    !text ||
    text.length > ICA_DEBIT_CHECK_INITIAL_MAX_LENGTH ||
    !/^[A-Z]+$/.test(text)
  ) {
    throw new Error(
      `${field} must contain 1–${ICA_DEBIT_CHECK_INITIAL_MAX_LENGTH} letters`,
    );
  }
  return text;
}
