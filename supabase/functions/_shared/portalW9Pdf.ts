import { fillPdfInputFields } from "./pdfFieldValues.ts";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFForm } from "https://esm.sh/pdf-lib@1.17.1";
import {
  getPdfLibFieldName,
  W9_TAX_CLASS_CHECKBOX_KEYS,
  W9_TAX_CLASS_KEY_TO_OPTION_ID,
  type W9FormFieldKey,
} from "./w9FormFields.ts";
import type { SubmitPortalW9Payload, PortalW9Record } from "./portalW9.ts";
import { storedLabelToTaxClass } from "./portalW9.ts";
import { inspectSigningPdf, signatureFieldRects, flattenSigningForm } from "./onboardingSigningPdf.ts";

export const W9_FORM_VERSION = "2024-03-irs";

const W9_REQUESTER_TEXT = [
  "PNCL LLC",
  "8927 E Wethersfield Rd",
  "Scottsdale, AZ 85260-5003",
].join("\n");

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
  try {
    form.getTextField(fieldName).setText(value);
  } catch {
    throw new Error(`Missing or invalid PDF form field: ${fieldName}`);
  }
}

function requireFieldName(form: PDFForm, key: W9FormFieldKey): string {
  const fieldName = getPdfLibFieldName(form, key);
  if (!fieldName) {
    throw new Error(`Missing PDF form field: ${key}`);
  }
  return fieldName;
}

function setRequiredText(form: PDFForm, key: W9FormFieldKey, value: string): void {
  setFormText(form, requireFieldName(form, key), value);
}

function setOptionalText(form: PDFForm, key: W9FormFieldKey, value: string | null | undefined): void {
  const fieldName = getPdfLibFieldName(form, key);
  if (!fieldName) return;
  setFormText(form, fieldName, value?.trim() ?? "");
}

function setCheckbox(form: PDFForm, key: W9FormFieldKey, checked: boolean): void {
  const fieldName = requireFieldName(form, key);
  const checkbox = form.getCheckBox(fieldName);
  if (checked) checkbox.check();
  else checkbox.uncheck();
}

function formatSignatureDate(signedAt: Date): string {
  return signedAt.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
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

function fillW9FormFields(
  pdfDoc: PDFDocument,
  payload: SubmitPortalW9Payload,
  signedAt: Date,
  font: PDFFont,
): void {
  const form = pdfDoc.getForm();
  setRequiredText(form, "legalName", payload.legalName);
  setOptionalText(form, "businessName", payload.businessName);
  setRequiredText(form, "addressLine1", payload.addressLine1);
  setRequiredText(form, "cityStateZip", `${payload.city}, ${payload.state} ${payload.zip}`);
  setRequiredText(form, "requester", W9_REQUESTER_TEXT);
  setOptionalText(form, "accountNumbers", payload.accountNumbers);
  setOptionalText(form, "exemptPayeeCode", payload.exemptPayeeCode);
  setOptionalText(form, "fatcaExemptionCode", payload.fatcaExemptionCode);
  form.getTextField(requireFieldName(form, "signatureDate")).setFontSize(10);
  setRequiredText(form, "signatureDate", formatSignatureDate(signedAt));
  setRequiredText(form, "signature", "");

  for (const key of W9_TAX_CLASS_CHECKBOX_KEYS) {
    const activeKey = taxClassToCheckboxKey(payload.taxClass);
    setCheckbox(form, key, activeKey === key);
  }

  if (payload.taxClass === "llc") {
    setRequiredText(form, "llcClassification", payload.llcClassification ?? "");
  }

  setCheckbox(form, "hasForeignPartners", payload.hasForeignPartners === true);

  if (payload.tinType === "ssn") {
    const [part1, part2, part3] = splitSsn(payload.tin);
    setRequiredText(form, "ssnPart1", part1);
    setRequiredText(form, "ssnPart2", part2);
    setRequiredText(form, "ssnPart3", part3);
    setOptionalText(form, "einPart1", "");
    setOptionalText(form, "einPart2", "");
  } else {
    const [part1, part2] = splitEin(payload.tin);
    setRequiredText(form, "einPart1", part1);
    setRequiredText(form, "einPart2", part2);
    setOptionalText(form, "ssnPart1", "");
    setOptionalText(form, "ssnPart2", "");
    setOptionalText(form, "ssnPart3", "");
  }

  form.updateFieldAppearances(font);
  flattenSigningForm(pdfDoc);
}

async function drawSignatureImage(pdfDoc: PDFDocument, signatureImageBase64: string, rect: { pageIndex: number; x: number; y: number; width: number; height: number }): Promise<void> {
  const pngBytes = decodeBase64ToBytes(signatureImageBase64);
  const image = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.getPages()[rect.pageIndex];
  if (!page) {
    throw new Error("Unable to place signature on W-9 PDF");
  }

  page.drawImage(image, {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
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
  _callerModuleUrl?: string,
  template?: { bytes: Uint8Array; sha256: string; assetId: string },
): Promise<Uint8Array> {
  if (!template) throw new Error("Upload and publish a W-9 in Onboarding Steps before signing.");
  await inspectSigningPdf(template.bytes, "w9");
  const templateBytes = template.bytes;
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const signatureField = getPdfLibFieldName(pdfDoc.getForm(), "signature")!;
  const rect = signatureFieldRects(pdfDoc, [signatureField])[0];
  await fillPdfInputFields(pdfDoc, payload.fieldValues, payload.signatureName, signedAt, true);
  fillW9FormFields(pdfDoc, payload, signedAt, font);

  if (payload.signatureImageBase64) {
    await drawSignatureImage(pdfDoc, payload.signatureImageBase64, rect);
  } else if (payload.signatureName.trim()) {
    const page = pdfDoc.getPages()[rect.pageIndex];
    page.drawText(payload.signatureName.trim(), {
      x: rect.x + 2,
      y: rect.y + 6,
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

  y = drawLabelValue(certPage, font, boldFont, "Uploaded template", template.assetId, 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Legal name", payload.legalName, 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Tax classification", payload.taxClassification, 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Certified by", payload.signatureName.trim(), 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Signed at (UTC)", signedAt.toISOString(), 72, y);

  y = drawLabelValue(certPage, font, boldFont, "Source SHA-256", template.sha256, 72, y);
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

export function resolveW9PdfPath(record: Pick<PortalW9Record, "user_id" | "pdf_path">): string {
  return record.pdf_path?.trim() || getW9PdfPath(record.user_id);
}

export async function generatePortalW9PdfFromRecord(
  record: PortalW9Record,
  tin: string,
  callerModuleUrl?: string,
  template?: { bytes: Uint8Array; sha256: string; assetId: string },
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

  return generateSignedW9Pdf(payload, new Date(record.signed_at), undefined, callerModuleUrl, template);
}
