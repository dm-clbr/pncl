import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import type { PortalW9Record } from "./portalW9.ts";

interface W9PdfInput {
  legalName: string;
  businessName: string | null;
  taxClassification: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  tinType: "ssn" | "ein";
  tin: string;
  signatureName: string;
  signedAt: Date;
  exemptPayeeCode: string | null;
  fatcaExemptionCode: string | null;
  accountNumbers: string | null;
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

function drawField(
  page: ReturnType<PDFDocument["getPages"]>[number],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): number {
  page.drawText(label, { x, y, size: 9, font: boldFont, color: rgb(0, 0, 0) });
  const lineY = y - 14;
  page.drawLine({
    start: { x, y: lineY },
    end: { x: x + width, y: lineY },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });
  if (value) {
    page.drawText(value, { x: x + 2, y: lineY + 3, size: 10, font, color: rgb(0, 0, 0) });
  }
  return lineY - 22;
}

export async function generatePortalW9Pdf(input: W9PdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  const width = 612 - margin * 2;
  let y = 742;

  page.drawText("Form W-9", { x: margin, y, size: 18, font: boldFont, color: rgb(0, 0, 0) });
  page.drawText("Request for Taxpayer Identification Number and Certification", {
    x: margin,
    y: y - 18,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  y -= 48;
  y = drawField(page, font, boldFont, "1. Name", input.legalName, margin, y, width);
  y = drawField(page, font, boldFont, "2. Business name, if different", input.businessName ?? "", margin, y, width);
  y = drawField(page, font, boldFont, "3. Federal tax classification", input.taxClassification, margin, y, width);
  y = drawField(page, font, boldFont, "5. Address", input.addressLine1, margin, y, width);
  if (input.addressLine2) {
    y = drawField(page, font, boldFont, "Address line 2", input.addressLine2, margin, y, width);
  }
  y = drawField(
    page,
    font,
    boldFont,
    "6. City, state, and ZIP",
    `${input.city}, ${input.state} ${input.zip}`,
    margin,
    y,
    width,
  );

  const tinLabel = input.tinType === "ssn" ? "Social security number" : "Employer identification number";
  y = drawField(page, font, boldFont, tinLabel, input.tin, margin, y, width);

  if (input.exemptPayeeCode) {
    y = drawField(page, font, boldFont, "Exempt payee code", input.exemptPayeeCode, margin, y, width);
  }
  if (input.fatcaExemptionCode) {
    y = drawField(page, font, boldFont, "FATCA exemption code", input.fatcaExemptionCode, margin, y, width);
  }
  if (input.accountNumbers) {
    y = drawField(page, font, boldFont, "Account number(s)", input.accountNumbers, margin, y, width);
  }

  y -= 4;
  page.drawText("Certification", { x: margin, y, size: 10, font: boldFont, color: rgb(0, 0, 0) });
  y -= 16;
  const certText =
    "Under penalties of perjury, I certify that the information provided on this form is correct.";
  for (const line of wrapText(certText, 95)) {
    page.drawText(line, { x: margin, y, size: 9, font, color: rgb(0, 0, 0) });
    y -= 12;
  }

  y -= 8;
  const sigWidth = width * 0.55;
  page.drawText("Signature", { x: margin, y, size: 9, font: boldFont, color: rgb(0, 0, 0) });
  page.drawText("Date", { x: margin + sigWidth + 24, y, size: 9, font: boldFont, color: rgb(0, 0, 0) });
  const sigLineY = y - 14;
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
  page.drawText(input.signatureName, {
    x: margin + 2,
    y: sigLineY + 3,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText(
    input.signedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    { x: margin + sigWidth + 26, y: sigLineY + 3, size: 10, font, color: rgb(0, 0, 0) },
  );

  page.drawText("Submitted to The PNCL — do not send to the IRS.", {
    x: margin,
    y: 48,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  return pdfDoc.save();
}

export function getW9PdfPath(userId: string): string {
  return `${userId}/w9.pdf`;
}

export async function generatePortalW9PdfFromRecord(
  record: PortalW9Record,
  tin: string,
): Promise<Uint8Array> {
  return generatePortalW9Pdf({
    legalName: record.legal_name,
    businessName: record.business_name,
    taxClassification: record.tax_classification,
    addressLine1: record.address_line1,
    addressLine2: record.address_line2,
    city: record.city,
    state: record.state,
    zip: record.zip,
    tinType: record.tin_type,
    tin,
    signatureName: record.signature_name,
    signedAt: new Date(record.signed_at),
    exemptPayeeCode: record.exempt_payee_code,
    fatcaExemptionCode: record.fatca_exemption_code,
    accountNumbers: record.account_numbers,
  });
}
