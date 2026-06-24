import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

export type DirectDepositAccountType = "checking" | "savings";

export interface SubmitDirectDepositPayload {
  legalName: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  accountType: DirectDepositAccountType;
  accountNumber: string;
  routingNumber: string;
  signatureName: string;
  authorizationAccepted: boolean;
}

export interface DirectDepositSummary {
  userId: string;
  legalName: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  accountType: DirectDepositAccountType;
  signatureName: string;
  signedAt: string;
  pdfPath: string;
}

export interface DirectDepositRecord {
  user_id: string;
  legal_name: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  account_type: DirectDepositAccountType;
  account_number_encrypted: string;
  routing_number_encrypted: string;
  signature_name: string;
  signed_at: string;
  pdf_path: string;
  created_at: string;
  updated_at: string;
}

export const DIRECT_DEPOSIT_TODO_SLUG = "direct_deposit_setup";
export const DIRECT_DEPOSIT_PDF_BUCKET = "portal-profile-documents";

export const DIRECT_DEPOSIT_AUTHORIZATION =
  "I authorize The PNCL and my bank to automatically deposit my check into my account listed above (this includes my authorization to correct entries made in error). This authorization will remain in effect until I give written notice to cancel it.";

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function isValidRoutingNumber(value: string): boolean {
  const digits = normalizeDigits(value, 9);
  return digits.length === 9;
}

function isValidAccountNumber(value: string): boolean {
  const digits = normalizeDigits(value, 17);
  return digits.length >= 4 && digits.length <= 17;
}

export function validateSubmitDirectDepositPayload(body: unknown): SubmitDirectDepositPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const legalName = optionalText(data.legalName);
  if (!legalName) {
    throw new Error("Name is required");
  }

  const addressLine1 = optionalText(data.addressLine1);
  if (!addressLine1) {
    throw new Error("Address is required");
  }

  const city = optionalText(data.city);
  if (!city) {
    throw new Error("City is required");
  }

  const state = optionalText(data.state).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error("State must be a two-letter code");
  }

  const zip = optionalText(data.zip);
  if (!/^\d{5}(-\d{4})?$/.test(zip)) {
    throw new Error("Enter a valid ZIP code");
  }

  const accountType = optionalText(data.accountType);
  if (accountType !== "checking" && accountType !== "savings") {
    throw new Error("Select checking or savings");
  }

  const accountNumber = normalizeDigits(optionalText(data.accountNumber), 17);
  if (!isValidAccountNumber(accountNumber)) {
    throw new Error("Enter a valid account number (4–17 digits)");
  }

  const routingNumber = normalizeDigits(optionalText(data.routingNumber), 9);
  if (!isValidRoutingNumber(routingNumber)) {
    throw new Error("Enter a valid 9-digit routing number");
  }

  const signatureName = optionalText(data.signatureName);
  if (!signatureName) {
    throw new Error("Signature is required");
  }

  if (data.authorizationAccepted !== true) {
    throw new Error("You must accept the authorization statement");
  }

  return {
    legalName,
    addressLine1,
    city,
    state,
    zip,
    accountType,
    accountNumber,
    routingNumber,
    signatureName,
    authorizationAccepted: true,
  };
}

export function mapDirectDepositSummary(row: DirectDepositRecord): DirectDepositSummary {
  return {
    userId: row.user_id,
    legalName: row.legal_name,
    addressLine1: row.address_line1,
    city: row.city,
    state: row.state,
    zip: row.zip,
    accountType: row.account_type,
    signatureName: row.signature_name,
    signedAt: row.signed_at,
    pdfPath: row.pdf_path,
  };
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function drawLabelValue(
  page: ReturnType<PDFDocument["getPages"]>[number],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): number {
  page.drawText(label, { x, y, size: 10, font: boldFont, color: rgb(0, 0, 0) });
  const lineY = y - 16;
  page.drawLine({
    start: { x, y: lineY },
    end: { x: x + width, y: lineY },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });
  if (value) {
    page.drawText(value, { x: x + 2, y: lineY + 4, size: 11, font, color: rgb(0, 0, 0) });
  }
  return lineY - 28;
}

export async function generateDirectDepositPdf(payload: SubmitDirectDepositPayload, signedAt: Date): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  const width = 612 - margin * 2;
  let y = 742;

  page.drawText("THE PNCL", {
    x: 612 - margin - 72,
    y: y + 4,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  page.drawText("DIRECT DEPOSIT REQUEST FORM", {
    x: margin,
    y,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  y -= 28;
  const intro =
    "Complete this form to request direct deposit of your commission payments. Once submitted, a signed copy is saved to your PNCL profile.";
  for (const line of wrapText(intro, 95)) {
    page.drawText(line, { x: margin, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 14;
  }

  y -= 8;
  y = drawLabelValue(page, font, boldFont, "Name", payload.legalName, margin, y, width);
  y = drawLabelValue(page, font, boldFont, "Address", payload.addressLine1, margin, y, width);

  page.drawText("City, State, ZIP code", { x: margin, y, size: 10, font: boldFont, color: rgb(0, 0, 0) });
  const cityStateZip = `${payload.city}, ${payload.state} ${payload.zip}`;
  const lineY = y - 16;
  page.drawLine({
    start: { x: margin, y: lineY },
    end: { x: margin + width, y: lineY },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });
  page.drawText(cityStateZip, { x: margin + 2, y: lineY + 4, size: 11, font, color: rgb(0, 0, 0) });
  y = lineY - 36;

  page.drawText("Please have my check automatically deposited into the following account:", {
    x: margin,
    y,
    size: 10,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 24;

  const checkingLabel = "Checking account number:";
  y = drawLabelValue(
    page,
    font,
    boldFont,
    checkingLabel.split(":")[0] + ":",
    payload.accountType === "checking" ? payload.accountNumber : "",
    margin,
    y,
    width,
  );

  page.drawText("Or", { x: margin, y: y + 8, size: 10, font: boldFont, color: rgb(0, 0, 0) });
  y -= 8;

  const savingsLabel = payload.accountType === "savings" ? payload.accountNumber : "";
  y = drawLabelValue(page, font, boldFont, "Savings/MIA/Money market account number:", savingsLabel, margin, y, width);
  y = drawLabelValue(page, font, boldFont, "Your bank's routing number", payload.routingNumber, margin, y, width);

  y -= 4;
  for (const line of wrapText(DIRECT_DEPOSIT_AUTHORIZATION, 95)) {
    page.drawText(line, { x: margin, y, size: 9.5, font, color: rgb(0, 0, 0) });
    y -= 13;
  }

  y -= 8;
  const sigWidth = width * 0.55;
  page.drawText("Signature", { x: margin, y, size: 10, font: boldFont, color: rgb(0, 0, 0) });
  page.drawText("Date", { x: margin + sigWidth + 24, y, size: 10, font: boldFont, color: rgb(0, 0, 0) });

  const sigLineY = y - 16;
  page.drawLine({
    start: { x: margin, y: sigLineY },
    end: { x: margin + sigWidth, y: sigLineY },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: margin + sigWidth + 24, y: sigLineY },
    end: { x: margin + width, y: sigLineY },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });

  page.drawText(payload.signatureName, {
    x: margin + 2,
    y: sigLineY + 4,
    size: 11,
    font,
    color: rgb(0, 0, 0),
  });

  const dateLabel = signedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  page.drawText(dateLabel, {
    x: margin + sigWidth + 26,
    y: sigLineY + 4,
    size: 11,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawRectangle({
    x: margin,
    y: 42,
    width,
    height: 8,
    color: rgb(0, 0, 0),
  });
  page.drawText("AIM HIGHER", {
    x: margin + width - 72,
    y: 24,
    size: 10,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  return pdfDoc.save();
}

export function getDirectDepositPdfPath(userId: string): string {
  return `${userId}/direct-deposit.pdf`;
}
