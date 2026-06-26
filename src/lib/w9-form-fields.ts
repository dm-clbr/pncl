/** IRS AcroForm field suffixes in pncl-w9-standard.pdf (from official fw9.pdf + PNCL additions). */
export const W9_FORM_FIELD_SUFFIXES = {
  legalName: "f1_01[0]",
  businessName: "f1_02[0]",
  taxClassIndividual: "c1_1[0]",
  taxClassCCorp: "c1_1[1]",
  taxClassSCorp: "c1_1[2]",
  taxClassPartnership: "c1_1[3]",
  taxClassTrustEstate: "c1_1[4]",
  taxClassLlc: "c1_1[5]",
  llcClassification: "f1_03[0]",
  taxClassOther: "c1_1[6]",
  otherClassification: "f1_04[0]",
  hasForeignPartners: "c1_2[0]",
  exemptPayeeCode: "f1_05[0]",
  fatcaExemptionCode: "f1_06[0]",
  addressLine1: "f1_07[0]",
  cityStateZip: "f1_08[0]",
  requester: "f1_09[0]",
  accountNumbers: "f1_10[0]",
  ssnPart1: "f1_11[0]",
  ssnPart2: "f1_12[0]",
  ssnPart3: "f1_13[0]",
  einPart1: "f1_14[0]",
  einPart2: "f1_15[0]",
  signature: "signature",
  signatureDate: "date",
} as const;

export type W9FormFieldKey = keyof typeof W9_FORM_FIELD_SUFFIXES;

export const W9_TAX_CLASS_CHECKBOX_KEYS = [
  "taxClassIndividual",
  "taxClassCCorp",
  "taxClassSCorp",
  "taxClassPartnership",
  "taxClassTrustEstate",
  "taxClassLlc",
  "taxClassOther",
] as const satisfies readonly W9FormFieldKey[];

export const W9_TAX_CLASS_KEY_TO_OPTION_ID = {
  taxClassIndividual: "individual",
  taxClassCCorp: "c_corp",
  taxClassSCorp: "s_corp",
  taxClassPartnership: "partnership",
  taxClassTrustEstate: "trust_estate",
  taxClassLlc: "llc",
  taxClassOther: "other",
} as const;

export type W9ResolvedFieldObjects = Record<
  string,
  Array<{ id: string; value?: unknown }> | undefined
>;

export function resolveW9FieldName(
  fieldObjects: W9ResolvedFieldObjects,
  key: W9FormFieldKey,
): string | null {
  const suffix = W9_FORM_FIELD_SUFFIXES[key];
  if (fieldObjects[suffix]?.[0]) {
    return suffix;
  }

  const match = Object.keys(fieldObjects).find(
    (name) => name === suffix || name.endsWith(`.${suffix}`) || name.endsWith(suffix),
  );
  return match ?? null;
}

export function getW9FieldEntry(
  fieldObjects: W9ResolvedFieldObjects,
  key: W9FormFieldKey,
) {
  const name = resolveW9FieldName(fieldObjects, key);
  return name ? fieldObjects[name]?.[0] : undefined;
}
