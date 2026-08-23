import {
  clip,
  endPath,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
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
  profilePhoto?: AgentBusinessCardPhoto | null;
}

export interface AgentBusinessCardPhoto {
  pngBytes: Uint8Array;
}

export interface AgentBusinessCardContent {
  name: string;
  affiliation: "PNCL AGENT";
  workEmail: string;
  phoneNumber: string;
}

const PNCL_EMAIL_PATTERN = /^[^\s@]+@thepncl\.com$/i;
const PORTRAIT_FRAME = { x: 179, y: 24, width: 54, height: 76 } as const;

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
  const valueSize = fitTextSize(valueFont, value, 8.25, 6.25, 116);

  page.drawText(label, { x: 20, y, size: 5.25, font: labelFont, color: steel });
  page.drawText(value, {
    x: 48,
    y: y - 1,
    size: valueSize,
    font: valueFont,
    color: bone,
  });
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "PN";
}

async function embedProfilePhoto(
  pdf: PDFDocument,
  photo: AgentBusinessCardPhoto | null | undefined,
): Promise<PDFImage | null> {
  if (!photo?.pngBytes.length) return null;
  try {
    return await pdf.embedPng(photo.pngBytes);
  } catch {
    return null;
  }
}

function drawPortraitFallback(page: PDFPage, bold: PDFFont, name: string): void {
  const accent = rgb(0.76, 0.31, 0.11);
  const bone = rgb(0.94, 0.93, 0.89);
  const frame = PORTRAIT_FRAME;
  const initials = getInitials(name);
  const initialsSize = fitTextSize(bold, initials, 20, 13, frame.width - 12);

  page.drawRectangle({ ...frame, color: rgb(0.13, 0.12, 0.13) });
  page.drawRectangle({ x: frame.x, y: frame.y + frame.height - 5, width: frame.width, height: 5, color: accent });
  page.drawCircle({
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2 + 5,
    size: 19,
    color: accent,
    opacity: 0.18,
  });
  page.drawText(initials, {
    x: frame.x + (frame.width - bold.widthOfTextAtSize(initials, initialsSize)) / 2,
    y: frame.y + 36,
    size: initialsSize,
    font: bold,
    color: bone,
  });
  page.drawText("PNCL", {
    x: frame.x + 18.5,
    y: frame.y + 9,
    size: 5,
    font: bold,
    color: accent,
  });
  page.drawRectangle({
    ...frame,
    borderColor: bone,
    borderWidth: 0.7,
    borderOpacity: 0.24,
    opacity: 0,
  });
}

function drawPortraitPhoto(page: PDFPage, image: PDFImage): void {
  const frame = PORTRAIT_FRAME;
  const scale = Math.max(frame.width / image.width, frame.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  page.drawRectangle({
    x: frame.x - 2,
    y: frame.y - 2,
    width: frame.width + 4,
    height: frame.height + 4,
    color: rgb(0.76, 0.31, 0.11),
  });
  page.pushOperators(
    pushGraphicsState(),
    rectangle(frame.x, frame.y, frame.width, frame.height),
    clip(),
    endPath(),
  );
  page.drawImage(image, {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  });
  page.pushOperators(popGraphicsState());
  page.drawRectangle({
    ...frame,
    borderColor: rgb(0.94, 0.93, 0.89),
    borderWidth: 0.7,
    borderOpacity: 0.35,
    opacity: 0,
  });
}

export async function buildAgentBusinessCardPdf(data: AgentBusinessCardData): Promise<Uint8Array> {
  const content = getAgentBusinessCardContent(data);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([BUSINESS_CARD_WIDTH_POINTS, BUSINESS_CARD_HEIGHT_POINTS]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const boldOblique = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const profilePhoto = await embedProfilePhoto(pdf, data.profilePhoto);
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

  const nameSize = fitTextSize(bold, content.name, 18, 10.5, 146);
  page.drawText(content.name, { x: 20, y: 75, size: nameSize, font: bold, color: bone });
  page.drawText(content.affiliation, { x: 20, y: 61.5, size: 6.25, font: bold, color: accent });
  page.drawLine({
    start: { x: 20, y: 52 },
    end: { x: 163, y: 52 },
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

  page.drawLine({
    start: { x: 170, y: 20 },
    end: { x: 170, y: 103 },
    color: bone,
    thickness: 0.5,
    opacity: 0.12,
  });
  if (profilePhoto) drawPortraitPhoto(page, profilePhoto);
  else drawPortraitFallback(page, bold, content.name);

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
