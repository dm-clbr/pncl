import { PDFDocument, StandardFonts, rgb, type PDFForm } from "https://esm.sh/pdf-lib@1.17.1";
import { ICA_FORM_FIELDS, assertValidDebitCheckInitial } from "./icaFormFields.ts";
import { loadIcaTemplateBytes } from "./icaTemplate.ts";

export const ICA_VERSION = "2026-standard";
export const ONBOARDING_CONTRACT_BUCKET = "onboarding-documents";
export const CONTRACT_SIGNATURE_TTL_MS = 48 * 60 * 60 * 1000;

export interface DebitCheckInitials {
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
}

export interface SubmitOnboardingContractPayload {
  legalName: string;
  personalEmail: string;
  signatureName: string;
  signatureImageBase64: string;
  debitCheckInitials: DebitCheckInitials;
  agreementAccepted: boolean;
  counselAcknowledged: boolean;
}

export interface OnboardingContractRecord {
  id: string;
  onboarding_id: string | null;
  legal_name: string;
  personal_email: string;
  signature_name: string;
  ica_version: string;
  debit_check_initials: DebitCheckInitials;
  agreement_accepted: boolean;
  counsel_acknowledged: boolean;
  signed_at: string;
  pdf_path: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface OnboardingContractSummary {
  id: string;
  legalName: string;
  personalEmail: string;
  signatureName: string;
  icaVersion: string;
  signedAt: string;
  pdfPath: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Page 14 signature field bounds in PDF user space (bottom-left origin). */
const ICA_SIGNATURE_IMAGE_RECT = {
  pageIndex: 13,
  x: 61.4836,
  y: 464.866,
  width: 213.7,
  height: 38.6,
} as const;

/**
 * Company counter-signature positions. Page 12 (index 11) holds the execution
 * COMPANY column ("BY" / "PRINT NAME" / "TITLE" labels); page 14 (index 13)
 * holds the Debit-Check "FOR COMPANY USE ONLY" block. Coordinates sit just
 * above each label's baseline.
 */
const ICA_COMPANY_EXECUTION_BLOCK = {
  pageIndex: 11,
  x: 62,
  signatureY: 497,
  printNameY: 453,
  titleY: 408,
  lineWidth: 213,
} as const;

const ICA_COMPANY_DEBIT_CHECK_BLOCK = {
  pageIndex: 13,
  x: 75,
  companyNameY: 346,
  signatureY: 302,
  nameAndTitleY: 257,
  lineWidth: 213,
} as const;

export interface IcaCompanySigner {
  name: string;
  title: string;
  signatureImageBase64: string | null;
}

/**
 * Kam's counter-signature comes from env config so the same deploy works
 * before and after the signature asset is provisioned:
 * - PNCL_COMPANY_SIGNER_NAME (required to enable pre-signing, e.g. "Kam ...")
 * - PNCL_COMPANY_SIGNER_TITLE (defaults to "Managing Member")
 * - PNCL_COMPANY_SIGNATURE_PNG_BASE64 (optional drawn-signature PNG; falls
 *   back to a script-style rendering of the signer name)
 */
export function getIcaCompanySigner(): IcaCompanySigner | null {
  const name = Deno.env.get("PNCL_COMPANY_SIGNER_NAME")?.trim();
  if (!name) return null;

  return {
    name,
    title: Deno.env.get("PNCL_COMPANY_SIGNER_TITLE")?.trim() || "Managing Member",
    signatureImageBase64: Deno.env.get("PNCL_COMPANY_SIGNATURE_PNG_BASE64")?.trim() || null,
  };
}

function normalizeSignatureImageBase64(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A drawn signature is required");
  }

  const trimmed = value.trim();
  const base64 = trimmed.includes(",") ? trimmed.split(",").pop() ?? "" : trimmed;
  if (!base64 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) {
    throw new Error("A valid drawn signature is required");
  }

  return trimmed;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const normalized = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function normalizeInitial(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  return assertValidDebitCheckInitial(value, field);
}

export function validateSubmitOnboardingContractPayload(body: unknown): SubmitOnboardingContractPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const legalName = normalizeRequiredString(data.legalName, "legalName");
  const personalEmail = normalizeRequiredString(data.personalEmail, "personalEmail").toLowerCase();
  const signatureName = normalizeRequiredString(data.signatureName, "signatureName");
  const signatureImageBase64 = normalizeSignatureImageBase64(data.signatureImageBase64);

  if (!EMAIL_PATTERN.test(personalEmail)) {
    throw new Error("A valid email address is required");
  }

  if (legalName.localeCompare(signatureName, undefined, { sensitivity: "accent" }) !== 0) {
    throw new Error("Signature must match your legal name exactly");
  }

  const initialsRaw = data.debitCheckInitials;
  if (!initialsRaw || typeof initialsRaw !== "object" || Array.isArray(initialsRaw)) {
    throw new Error("Debit-Check initials are required");
  }

  const initialsObj = initialsRaw as Record<string, unknown>;
  const debitCheckInitials: DebitCheckInitials = {
    a: normalizeInitial(initialsObj.a, "Debit-Check initial A"),
    b: normalizeInitial(initialsObj.b, "Debit-Check initial B"),
    c: normalizeInitial(initialsObj.c, "Debit-Check initial C"),
    d: normalizeInitial(initialsObj.d, "Debit-Check initial D"),
    e: normalizeInitial(initialsObj.e, "Debit-Check initial E"),
  };

  if (data.agreementAccepted !== true) {
    throw new Error("You must accept the Independent Contractor Agreement");
  }

  if (data.counselAcknowledged !== true) {
    throw new Error("You must confirm that you have read the agreement");
  }

  return {
    legalName,
    personalEmail,
    signatureName,
    signatureImageBase64,
    debitCheckInitials,
    agreementAccepted: true,
    counselAcknowledged: true,
  };
}

export function getOnboardingContractPdfPath(signatureId: string): string {
  return `contracts/${signatureId}/ica-signed.pdf`;
}

export function mapOnboardingContractSummary(record: OnboardingContractRecord): OnboardingContractSummary {
  return {
    id: record.id,
    legalName: record.legal_name,
    personalEmail: record.personal_email,
    signatureName: record.signature_name,
    icaVersion: record.ica_version,
    signedAt: record.signed_at,
    pdfPath: record.pdf_path,
  };
}

export function isContractSignatureExpired(signedAt: string): boolean {
  return Date.now() - new Date(signedAt).getTime() > CONTRACT_SIGNATURE_TTL_MS;
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

function setFormText(form: PDFForm, fieldName: string, value: string): void {
  try {
    form.getTextField(fieldName).setText(value);
  } catch {
    throw new Error(`Missing or invalid PDF form field: ${fieldName}`);
  }
}

function formatIcaEffectiveDate(signedAt: Date): {
  full: string;
  day: string;
  month: string;
  yearLast2: string;
} {
  const full = signedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return {
    full,
    day: String(signedAt.getDate()),
    month: signedAt.toLocaleDateString("en-US", { month: "long" }),
    yearLast2: String(signedAt.getFullYear()).slice(-2),
  };
}

function fillIcaFormFields(
  form: PDFForm,
  payload: SubmitOnboardingContractPayload,
  signedAt: Date,
): void {
  const dateParts = formatIcaEffectiveDate(signedAt);

  setFormText(form, ICA_FORM_FIELDS.day, dateParts.day);
  setFormText(form, ICA_FORM_FIELDS.month, dateParts.month);
  setFormText(form, ICA_FORM_FIELDS.yearLast2, dateParts.yearLast2);
  setFormText(form, ICA_FORM_FIELDS.introName, payload.legalName);
  setFormText(form, ICA_FORM_FIELDS.introDate, dateParts.full);

  setFormText(form, ICA_FORM_FIELDS.fullName, payload.legalName);
  setFormText(form, ICA_FORM_FIELDS.email, payload.personalEmail);
  setFormText(form, ICA_FORM_FIELDS.signatureDate, dateParts.full);
  setFormText(form, ICA_FORM_FIELDS.signature, "");

  setFormText(form, ICA_FORM_FIELDS.agentName, payload.legalName);
  setFormText(form, ICA_FORM_FIELDS.initialA, payload.debitCheckInitials.a);
  setFormText(form, ICA_FORM_FIELDS.initialB, payload.debitCheckInitials.b);
  setFormText(form, ICA_FORM_FIELDS.initialC, payload.debitCheckInitials.c);
  setFormText(form, ICA_FORM_FIELDS.initialD, payload.debitCheckInitials.d);
  setFormText(form, ICA_FORM_FIELDS.initialE, payload.debitCheckInitials.e);

  form.updateFieldAppearances();
  form.flatten();
}

async function drawSignatureImage(
  pdfDoc: PDFDocument,
  signatureImageBase64: string,
): Promise<void> {
  const pngBytes = decodeBase64ToBytes(signatureImageBase64);
  const image = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.getPages()[ICA_SIGNATURE_IMAGE_RECT.pageIndex];
  if (!page) {
    throw new Error("Unable to place signature on agreement PDF");
  }

  page.drawImage(image, {
    x: ICA_SIGNATURE_IMAGE_RECT.x,
    y: ICA_SIGNATURE_IMAGE_RECT.y,
    width: ICA_SIGNATURE_IMAGE_RECT.width,
    height: ICA_SIGNATURE_IMAGE_RECT.height,
  });
}

async function drawCompanyCounterSignature(
  pdfDoc: PDFDocument,
  signer: IcaCompanySigner,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  scriptFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
): Promise<void> {
  const pages = pdfDoc.getPages();
  const signatureImage = signer.signatureImageBase64
    ? await pdfDoc.embedPng(decodeBase64ToBytes(signer.signatureImageBase64))
    : null;

  const drawSignature = (
    page: ReturnType<PDFDocument["getPages"]>[number],
    x: number,
    y: number,
  ) => {
    if (signatureImage) {
      const scale = Math.min(
        ICA_COMPANY_EXECUTION_BLOCK.lineWidth / signatureImage.width,
        36 / signatureImage.height,
      );
      page.drawImage(signatureImage, {
        x,
        y,
        width: signatureImage.width * scale,
        height: signatureImage.height * scale,
      });
    } else {
      page.drawText(signer.name, {
        x,
        y: y + 6,
        size: 18,
        font: scriptFont,
        color: rgb(0.1, 0.1, 0.35),
      });
    }
  };

  const executionPage = pages[ICA_COMPANY_EXECUTION_BLOCK.pageIndex];
  if (executionPage) {
    drawSignature(executionPage, ICA_COMPANY_EXECUTION_BLOCK.x, ICA_COMPANY_EXECUTION_BLOCK.signatureY);
    executionPage.drawText(signer.name, {
      x: ICA_COMPANY_EXECUTION_BLOCK.x,
      y: ICA_COMPANY_EXECUTION_BLOCK.printNameY + 6,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
    executionPage.drawText(signer.title, {
      x: ICA_COMPANY_EXECUTION_BLOCK.x,
      y: ICA_COMPANY_EXECUTION_BLOCK.titleY + 6,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const debitPage = pages[ICA_COMPANY_DEBIT_CHECK_BLOCK.pageIndex];
  if (debitPage) {
    debitPage.drawText("PNCL, LLC", {
      x: ICA_COMPANY_DEBIT_CHECK_BLOCK.x,
      y: ICA_COMPANY_DEBIT_CHECK_BLOCK.companyNameY + 6,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
    drawSignature(debitPage, ICA_COMPANY_DEBIT_CHECK_BLOCK.x, ICA_COMPANY_DEBIT_CHECK_BLOCK.signatureY);
    debitPage.drawText(`${signer.name}, ${signer.title}`, {
      x: ICA_COMPANY_DEBIT_CHECK_BLOCK.x,
      y: ICA_COMPANY_DEBIT_CHECK_BLOCK.nameAndTitleY + 6,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
  }
}

export async function generateSignedIcaPdf(
  payload: SubmitOnboardingContractPayload,
  signedAt: Date,
  metadata?: { ipAddress?: string; userAgent?: string },
  callerModuleUrl?: string,
): Promise<Uint8Array> {
  const templateBytes = await loadIcaTemplateBytes(callerModuleUrl ?? import.meta.url);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  fillIcaFormFields(pdfDoc.getForm(), payload, signedAt);
  await drawSignatureImage(pdfDoc, payload.signatureImageBase64);

  const companySigner = getIcaCompanySigner();
  if (companySigner) {
    const scriptFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    await drawCompanyCounterSignature(pdfDoc, companySigner, font, scriptFont);
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
  certPage.drawText("PNCL Independent Contractor Agreement", {
    x: 72,
    y,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 36;

  y = drawLabelValue(certPage, font, boldFont, "Agreement version", ICA_VERSION, 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Contractor legal name", payload.legalName, 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Contractor email", payload.personalEmail, 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Signature", "Drawn electronic signature", 72, y);
  y = drawLabelValue(certPage, font, boldFont, "Signed at (UTC)", signedAt.toISOString(), 72, y);
  y = drawLabelValue(
    certPage,
    font,
    boldFont,
    "Debit-Check initials",
    `A:${payload.debitCheckInitials.a} B:${payload.debitCheckInitials.b} C:${payload.debitCheckInitials.c} D:${payload.debitCheckInitials.d} E:${payload.debitCheckInitials.e}`,
    72,
    y,
  );

  if (companySigner) {
    y = drawLabelValue(
      certPage,
      font,
      boldFont,
      "Company counter-signature",
      `${companySigner.name}, ${companySigner.title} (pre-authorized)`,
      72,
      y,
    );
  }

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
    "The contractor confirmed they read the agreement, had the opportunity to consult independent legal counsel, and agreed to the ICA and Debit-Check Authorization.",
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

export async function createOnboardingContractSignedUrl(
  adminClient: import("https://esm.sh/@supabase/supabase-js@2.49.1").SupabaseClient,
  pdfPath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await adminClient.storage
    .from(ONBOARDING_CONTRACT_BUCKET)
    .createSignedUrl(pdfPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create contract download link");
  }

  return data.signedUrl;
}
