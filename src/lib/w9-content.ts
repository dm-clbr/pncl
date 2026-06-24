/** Static copy aligned with IRS Form W-9 (Rev. March 2024). */

export const IRS_W9_PDF_URL = "https://www.irs.gov/pub/irs-pdf/fw9.pdf";
export const IRS_W9_INSTRUCTIONS_URL = "https://www.irs.gov/FormW9";

export const W9_FORM_REVISION = "Rev. March 2024";

export const W9_REQUESTER = {
  name: "The PNCL / Pinnacle Life Group",
  addressLine1: "209 Philadelphia Ave",
  cityStateZip: "Egg Harbor City, NJ 08215",
} as const;

export const W9_TAX_CLASS_OPTIONS = [
  { id: "individual", label: "Individual/sole proprietor" },
  { id: "c_corp", label: "C corporation" },
  { id: "s_corp", label: "S corporation" },
  { id: "partnership", label: "Partnership" },
  { id: "trust_estate", label: "Trust/estate" },
  { id: "llc", label: "Limited liability company (LLC)" },
  { id: "other", label: "Other (see instructions)" },
] as const;

export type W9TaxClassOptionId = (typeof W9_TAX_CLASS_OPTIONS)[number]["id"];

export const W9_LLC_CLASSIFICATIONS = ["C", "S", "P"] as const;
export type W9LlcClassification = (typeof W9_LLC_CLASSIFICATIONS)[number];

export function showsForeignPartnersCheckbox(taxClass: W9TaxClassOptionId, llcClassification: W9LlcClassification | ""): boolean {
  return taxClass === "partnership"
    || taxClass === "trust_estate"
    || (taxClass === "llc" && llcClassification === "P");
}

export function showsExemptionFields(taxClass: W9TaxClassOptionId): boolean {
  return taxClass !== "individual";
}

export const W9_CERTIFICATION_ITEMS = [
  "The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and",
  "I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and",
  "I am a U.S. citizen or other U.S. person (defined in the form instructions); and",
  "The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.",
] as const;

export const W9_INSTRUCTION_SECTIONS = [
  {
    id: "purpose",
    title: "Purpose of Form",
    body:
      "An individual or entity who is required to file an information return with the IRS must obtain your correct taxpayer identification number (TIN) to report amounts paid to you — for example, on Form 1099-NEC for nonemployee compensation. Give the completed form to the requester. Do not send it to the IRS.",
  },
  {
    id: "backup",
    title: "Backup withholding",
    body:
      "You may be subject to backup withholding if you do not furnish your TIN, do not certify your TIN when required, or fail to report interest and dividends on your tax return. Providing your correct TIN and signing the certification helps avoid backup withholding on reportable payments.",
  },
  {
    id: "privacy",
    title: "Privacy Act Notice",
    body:
      "Section 6109 requires you to provide your correct TIN to persons who must file information returns with the IRS. The requester uses this form to report payments made to you. You must provide your TIN whether or not you are required to file a tax return.",
  },
] as const;

export function taxClassToStoredLabel(
  taxClass: W9TaxClassOptionId,
  llcClassification: W9LlcClassification | "",
): string {
  const option = W9_TAX_CLASS_OPTIONS.find((item) => item.id === taxClass);
  if (!option) return "";
  if (taxClass === "llc" && llcClassification) {
    return `${option.label} (${llcClassification})`;
  }
  return option.label;
}

export function storedLabelToTaxClass(stored: string): {
  taxClass: W9TaxClassOptionId;
  llcClassification: W9LlcClassification | "";
} {
  const llcMatch = stored.match(/^Limited liability company \(LLC\) \(([CSP])\)$/);
  if (llcMatch) {
    return { taxClass: "llc", llcClassification: llcMatch[1] as W9LlcClassification };
  }

  const found = W9_TAX_CLASS_OPTIONS.find((item) => item.label === stored);
  if (found) {
    return { taxClass: found.id, llcClassification: "" };
  }

  return { taxClass: "individual", llcClassification: "" };
}
