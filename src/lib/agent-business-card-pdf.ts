import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { requireValidAgentPhoneNumber } from "@/lib/agent-phone";

export const BUSINESS_CARD_WIDTH_POINTS = 3.5 * 72;
export const BUSINESS_CARD_HEIGHT_POINTS = 2 * 72;

export interface AgentBusinessCardData {
  firstName: string;
  lastName: string;
  workEmail: string;
  workEmailVerified: boolean;
  phoneNumber: string;
}

export interface AgentBusinessCardContent {
  name: string;
  affiliation: "PNCL AGENT";
  workEmail: string;
  phoneNumber: string;
}

const PNCL_EMAIL_PATTERN = /^[^\s@]+@thepncl\.com$/i;

function cleanSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export function getAgentBusinessCardContent(data: AgentBusinessCardData): AgentBusinessCardContent {
  const firstName = cleanSingleLine(data.firstName);
  const lastName = cleanSingleLine(data.lastName);
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const workEmail = cleanSingleLine(data.workEmail).toLowerCase();

  if (!firstName || !lastName) {
    throw new Error("First name and last name are required for the business card.");
  }
  if (!data.workEmailVerified || !PNCL_EMAIL_PATTERN.test(workEmail)) {
    throw new Error("A verified PNCL work email is required for the business card.");
  }

  return {
    name,
    affiliation: "PNCL AGENT",
    workEmail,
    phoneNumber: requireValidAgentPhoneNumber(data.phoneNumber),
  };
}

export function canGenerateAgentBusinessCard(data: AgentBusinessCardData): boolean {
  try {
    getAgentBusinessCardContent(data);
    return true;
  } catch {
    return false;
  }
}

function fitTextSize(font: PDFFont, text: string, maxSize: number, minSize: number, maxWidth: number): number {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.25;
  }
  return size;
}

function drawContactLine({
  page,
  label,
  value,
  y,
  labelFont,
  valueFont,
}: {
  page: PDFPage;
  label: string;
  value: string;
  y: number;
  labelFont: PDFFont;
  valueFont: PDFFont;
}) {
  const steel = rgb(0.58, 0.59, 0.59);
  const bone = rgb(0.94, 0.93, 0.89);
  const valueSize = fitTextSize(valueFont, value, 8.25, 6.5, 182);

  page.drawText(label, { x: 20, y, size: 5.25, font: labelFont, color: steel });
  page.drawText(value, {
    x: 48,
    y: y - 1,
    size: valueSize,
    font: valueFont,
    color: bone,
  });
}

export async function buildAgentBusinessCardPdf(data: AgentBusinessCardData): Promise<Uint8Array> {
  const content = getAgentBusinessCardContent(data);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([BUSINESS_CARD_WIDTH_POINTS, BUSINESS_CARD_HEIGHT_POINTS]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const boldOblique = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const ink = rgb(0.075, 0.075, 0.078);
  const inkRaised = rgb(0.105, 0.102, 0.112);
  const bone = rgb(0.94, 0.93, 0.89);
  const steel = rgb(0.58, 0.59, 0.59);
  const accent = rgb(0.76, 0.31, 0.11);

  pdf.setTitle(`${content.name} - PNCL Business Card`);
  pdf.setAuthor("PNCL");
  pdf.setSubject("PNCL agent business card");
  pdf.setCreator("PNCL Agent Portal");

  page.drawRectangle({
    x: 0,
    y: 0,
    width: BUSINESS_CARD_WIDTH_POINTS,
    height: BUSINESS_CARD_HEIGHT_POINTS,
    color: ink,
  });
  page.drawRectangle({ x: 0, y: 0, width: 7, height: BUSINESS_CARD_HEIGHT_POINTS, color: accent });
  page.drawRectangle({
    x: 178,
    y: 0,
    width: 74,
    height: BUSINESS_CARD_HEIGHT_POINTS,
    color: inkRaised,
    opacity: 0.55,
  });
  page.drawCircle({ x: 240, y: 132, size: 44, color: accent, opacity: 0.08 });
  page.drawRectangle({
    x: 0.75,
    y: 0.75,
    width: BUSINESS_CARD_WIDTH_POINTS - 1.5,
    height: BUSINESS_CARD_HEIGHT_POINTS - 1.5,
    borderColor: bone,
    borderWidth: 0.5,
    borderOpacity: 0.12,
  });

  page.drawText("PNCL", { x: 20, y: 114, size: 16, font: boldOblique, color: bone });
  page.drawText("AGENT NETWORK", { x: 69, y: 117.5, size: 5.25, font: bold, color: steel });
  page.drawRectangle({ x: 20, y: 108, width: 20, height: 1.75, color: accent });
  page.drawRectangle({ x: 224, y: 113, width: 11, height: 11, color: accent });

  const nameSize = fitTextSize(bold, content.name, 19, 11.5, 212);
  page.drawText(content.name, { x: 20, y: 75, size: nameSize, font: bold, color: bone });
  page.drawText(content.affiliation, { x: 20, y: 61.5, size: 6.25, font: bold, color: accent });
  page.drawLine({
    start: { x: 20, y: 52 },
    end: { x: 232, y: 52 },
    color: bone,
    thickness: 0.5,
    opacity: 0.16,
  });

  drawContactLine({
    page,
    label: "EMAIL",
    value: content.workEmail,
    y: 35,
    labelFont: bold,
    valueFont: regular,
  });
  drawContactLine({
    page,
    label: "PHONE",
    value: content.phoneNumber,
    y: 18,
    labelFont: bold,
    valueFont: regular,
  });

  return pdf.save({ useObjectStreams: false });
}

export function getAgentBusinessCardFileName(data: AgentBusinessCardData): string {
  const { name } = getAgentBusinessCardContent(data);
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "pncl-agent"}-pncl-business-card.pdf`;
}

export async function downloadAgentBusinessCardPdf(data: AgentBusinessCardData): Promise<void> {
  const bytes = await buildAgentBusinessCardPdf(data);
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = getAgentBusinessCardFileName(data);
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
