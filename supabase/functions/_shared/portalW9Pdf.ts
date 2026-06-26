import { PDFDocument, StandardFonts, rgb, type PDFForm } from "https://esm.sh/pdf-lib@1.17.1";
import {
  getPdfLibFieldName,
  W9_TAX_CLASS_CHECKBOX_KEYS,
  W9_TAX_CLASS_KEY_TO_OPTION_ID,
  type W9FormFieldKey,
} from "./w9FormFields.ts";
import type { SubmitPortalW9Payload, PortalW9Record } from "./portalW9.ts";
import { storedLabelToTaxClass } from "./portalW9.ts";
import { loadW9TemplateBytes } from "./w9Template.ts";

export const W9_FORM_VERSION = "2024-03-irs";

const W9_REQUESTER_TEXT = [
  "PNCL LLC",
  "8927 E Wethersfield Rd",
  "Scottsdale, AZ 85260-5003",
].join("\n");

/** Signature image placement on page 1 (PDF user space, bottom-left origin). */
export const W9_SIGNATURE_IMAGE_RECT = {
  pageIndex: 0,
  x: 58.6,
  y: 310,
  width: 320,
  height: 24,
} as const;

function decodeBase64ToBytes(base64: string): Uint8Array {
  const normalized = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function setFormText(form: PDFForm, fieldName: string, value: string): void {
  form.getTextField(fieldName).setText(value);
}

function setOptionalText(form: PDFForm, key: W9FormFieldKey, value: string | null | undefined): void {
  const fieldName = getPdfLibFieldName(form, key);
  if (!fieldName) return;
  setFormText(form, fieldName, value?.trim() ?? "");
}

function setCheckbox(form: PDFForm, key: W9FormFieldKey, checked: boolean): void {
  const fieldName = getPdfLibFieldName(form, key);
  if (!fieldName) return;
  const checkbox = form.getCheckBox(fieldName);
  if (checked) checkbox.check();
  else checkbox.uncheck();
}

function formatSignatureDate(signedAt: Date): string {
  return signedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function splitSsn(tin: string): [string, string, string] {
  const digits = tin.replace(/\D/g, "");
  return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 9)];
}

function splitEin(tin: string): [string, string] {
  const digits = tin.replace(/\D/g, "");
  return [digits.slice(0, 2), digits.slice(2, 9)];
}

function taxClassToCheckboxKey(taxClass: string | undefined): (typeof W9_TAX_CLASS_CHECKBOX_KEYS)[number] | null {
  if (!taxClass) return null;
  for (const key of W9_TAX_CLASS_CHECKBOX_KEYS) {
    if (W9_TAX_CLASS_KEY_TO_OPTION_ID[key] === taxClass) return key;
  }
  return null;
}

function fillW9FormFields(form: PDFForm, payload: SubmitPortalW9Payload, signedAt: Date): void {
  setOptionalText(form, "legalName", payload.legalName);
  setOptionalText(form, "businessName", payload.businessName);
  setOptionalText(form, "addressLine1", payload.addressLine1);
  setOptionalText(form, "cityStateZip", `${payload.city}, ${payload.state} ${payload.zip}`);
  setOptionalText(form, "requester", W9_REQUESTER_TEXT);
  setOptionalText(form, "accountNumbers", payload.accountNumbers);
  setOptionalText(form, "exemptPayeeCode", payload.exemptPayeeCode);
  setOptionalText(form, "fatcaExemptionCode", payload.fatcaExemptionCode);
  setOptionalText(form, "signatureDate", formatSignatureDate(signedAt));
  setOptionalText(form, "signature", "");

  for (const key of W9_TAX_CLASS_CHECKBOX_KEYS) {
    const activeKey = taxClassToCheckboxKey(payload.taxClass);
    setCheckbox(form, key, activeKey === key);
  }

  if (payload.taxClass === "llc") {
    setOptionalText(form, "llcClassification", payload.llcClassification ?? "");
  }

  setCheckbox(form, "hasForeignPartners", payload.hasForeignPartners === true);

  if (payload.tinType === "ssn") {
    const [part1, part2, part3] = splitSsn(payload.tin);
    setOptionalText(form, "ssnPart1", part1);
    setOptionalText(form, "ssnPart2", part2);
    setOptionalText(form, "ssnPart3", part3);
    setOptionalText(form, "einPart1", "");
    setOptionalText(form, "einPart2", "");
  } else {
    const [part1, part2] = splitEin(payload.tin);
    setOptionalText(form, "einPart1", part1);
    setOptionalText(form, "einPart2", part2);
    setOptionalText(form, "ssnPart1", "");
    setOptionalText(form, "ssnPart2", "");
    setOptionalText(form, "ssnPart3", "");
  }

  form.updateFieldAppearances();
  form.flatten();
}

async function drawSignatureImage(pdfDoc: PDFDocument, signatureImageBase64: string): Promise<void> {
  const pngBytes = decodeBase64ToBytes(signatureImageBase64);
  const image = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.getPages()[W9_SIGNATURE_IMAGE_RECT.pageIndex];
  if (!page) {
    throw new Error("Unable to place signature on W-9 PDF");
  }

  page.drawImage(image, {
    x: W9_SIGNATURE_IMAGE_RECT.x,
    y: W9_SIGNATURE_IMAGE_RECT.y,
    width: W9_SIGNATURE_IMAGE_RECT.width,
    height: W9_SIGNATURE_IMAGE_RECT.height,
  });
}

function drawLabelValue(
  page: ReturnType<PDFDocument["getPages"]>[number],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  label: string,
  value: string,
  x: number,
  y: number,
): number {
  page.drawText(label, { x, y, size: 9, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(value, { x, y: y - 14, size: 11, font, color: rgb(0, 0, 0) });
  return y - 34;
}

export async function generateSignedW9Pdf(
  payload: SubmitPortalW9Payload,
  signedAt: Date,
  metadata?: { ipAddress?: string; userAgent?: string },
  callerModuleUrl?: string,
): Promise<Uint8Array> {
  const templateBytes = await loadW9TemplateBytes(callerModuleUrl ?? import.meta.url);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  fillW9FormFields(pdfDoc.getForm(), payload, signedAt);

  if (payload.signatureImageBase64) {
    await drawSignatureImage(pdfDoc, payload.signatureImageBase64);
  } else if (payload.signatureName.trim()) {
    const page = pdfDoc.getPages()[W9_SIGNATURE_IMAGE_RECT.pageIndex];
    page.drawText(payload.signatureName.trim(), {
      x: W9_SIGNATURE_IMAGE_RECT.x + 2,
      y: W9_SIGNATURE_IMAGE_RECT.y + 6,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const certPage = pdfDoc.addPage([612, 792]);
  let y = 740;
  certPage.drawText("Electronic Signature Record", {
    x: 72,
    y,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 28;
  certPage.drawText("PNCL Form W-9 Submission", {
    x: 72,
    y,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 36;

  y = drawLabelValue(certPage, font, boldFont, "Form version", W9_FORM_VERSION, 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Legal name", payload.legalName, 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Tax classification", payload.taxClassification, 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Signature", "Drawn electronic signature", 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Signed at (UTC)", signedAt.toISOString(), 72, y);

  if (metadata?.ipAddress) {
    y = drawLabelValue(certPage, font, boldFont, "IP address", metadata.ipAddress, 72, y);
  }

  if (metadata?.userAgent) {
    const truncated = metadata.userAgent.length > 120
      ? `${metadata.userAgent.slice(0, 117)}...`
      : metadata.userAgent;
    y = drawLabelValue(certPage, font, boldFont, "User agent", truncated, 72, y);
  }

  certPage.drawText(
    "The taxpayer certified under penalties of perjury that the information provided on Form W-9 is correct.",
    {
      x: 72,
      y: y - 10,
      size: 9,
      font,
      color: rgb(0.25, 0.25, 0.25),
      maxWidth: 468,
      lineHeight: 12,
    },
  );

  return await pdfDoc.save();
}

export function getW9PdfPath(userId: string): string {
  return `${userId}/w9.pdf`;
}

export async function generatePortalW9PdfFromRecord(
  record: PortalW9Record,
  tin: string,
  callerModuleUrl?: string,
): Promise<Uint8Array> {
  const { taxClass, llcClassification } = storedLabelToTaxClass(record.tax_classification);

  const payload: SubmitPortalW9Payload = {
    legalName: record.legal_name,
    businessName: record.business_name,
    taxClassification: record.tax_classification,
    taxClass,
    llcClassification: llcClassification || null,
    addressLine1: record.address_line1,
    addressLine2: record.address_line2,
    city: record.city,
    state: record.state,
    zip: record.zip,
    tinType: record.tin_type,
    tin,
    signatureName: record.signature_name,
    signatureImageBase64: "",
    certificationAccepted: true,
    hasForeignPartners: record.has_foreign_partners,
    exemptPayeeCode: record.exempt_payee_code,
    fatcaExemptionCode: record.fatca_exemption_code,
    accountNumbers: record.account_numbers,
  };

  return generateSignedW9Pdf(payload, new Date(record.signed_at), undefined, callerModuleUrl);
}
