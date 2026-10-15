import {
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  moveTo,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSpacing,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { LOGO_PATH, LOGO_VIEWBOX } from "@/components/pncl-logo-path";
import { requireValidAgentPhoneNumber } from "@/lib/agent-phone";

export const BUSINESS_CARD_WIDTH_POINTS = 3.5 * 72;
export const BUSINESS_CARD_HEIGHT_POINTS = 2 * 72;

export interface AgentBusinessCardData {
  firstName: string;
  lastName: string;
  workEmail: string;
  workEmailVerified: boolean;
  phoneNumber: string;
  npn?: string | null;
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
  npn: string | null;
}

const PNCL_EMAIL_PATTERN = /^[^\s@]+@thepncl\.com$/i;

/* The card follows the agent portal: a warm near-black base with the
   gradient's wall light in the top left, white type on three opacity tiers
   instead of a second colour, and the portal accent as a single spark. */
const CARD = {
  margin: 18,
  white: rgb(1, 1, 1),
  accent: rgb(1, 0.227, 0.118),
  paneFill: rgb(0.14, 0.115, 0.095),
} as const;
const PORTRAIT = { cx: 206, cy: 90, r: 28 } as const;

/** A closed circle for the clip path: four cubic arcs, kappa 0.5523. */
function circlePath(cx: number, cy: number, r: number) {
  const k = r * 0.5523;
  return [
    moveTo(cx + r, cy),
    appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
    appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
    appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
    appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
    closePath(),
  ];
}

/** The gradient's wall light in the top left corner, as a real PDF radial
    shading (type 3), which pdf-lib has no helper for. A vector paint, so the
    card still embeds no image unless the agent has a photo. The centre is
    the light at 0.22 over the ink, falling to the ink by 190pt. */
function drawWallLight(pdf: PDFDocument, page: PDFPage): void {
  const mix = (light: number, ink: number) => ink + 0.22 * (light - ink);
  const ink = [0.055, 0.047, 0.043];
  const shading = pdf.context.register(
    pdf.context.obj({
      ShadingType: 3,
      ColorSpace: "DeviceRGB",
      Coords: [24, 150, 0, 24, 150, 190],
      Function: {
        FunctionType: 2,
        Domain: [0, 1],
        C0: [mix(0.91, ink[0]), mix(0.8, ink[1]), mix(0.69, ink[2])],
        C1: ink,
        N: 1.4,
      },
      Extend: [true, true],
    }),
  );
  const { Resources } = page.node.normalizedEntries();
  let shadings = Resources.lookupMaybe(PDFName.of("Shading"), PDFDict);
  if (!shadings) {
    shadings = pdf.context.obj({});
    Resources.set(PDFName.of("Shading"), shadings);
  }
  shadings.set(PDFName.of("WallLight"), shading);
  page.pushOperators(
    pushGraphicsState(),
    PDFOperator.of(PDFOperatorNames.ShadingFill, [PDFName.of("WallLight")]),
    popGraphicsState(),
  );
}

/** Tracked caps, which pdf-lib's drawText cannot set: the character spacing
    lives in the graphics state that drawText inherits. */
function drawTracked(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; size: number; font: PDFFont; opacity: number; tracking: number },
) {
  const { tracking, ...rest } = options;
  page.pushOperators(pushGraphicsState(), setCharacterSpacing(tracking));
  page.drawText(text, { ...rest, color: CARD.white });
  page.pushOperators(popGraphicsState());
}

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
    npn: cleanSingleLine(data.npn ?? "") || null,
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
  const x = CARD.margin + 30;
  const valueSize = fitTextSize(valueFont, value, 8, 6.25, BUSINESS_CARD_WIDTH_POINTS - CARD.margin - x);

  drawTracked(page, label, { x: CARD.margin, y: y + 0.75, size: 5, font: labelFont, opacity: 0.55, tracking: 0.9 });
  page.drawText(value, { x, y, size: valueSize, font: valueFont, color: CARD.white, opacity: 0.92 });
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

/** The portal's avatar: a round portrait with a quiet ring. */
function drawPortraitRing(page: PDFPage): void {
  const { cx, cy, r } = PORTRAIT;
  page.drawCircle({ x: cx, y: cy, size: r + 3.5, borderColor: CARD.white, borderWidth: 0.5, borderOpacity: 0.14 });
  page.drawCircle({ x: cx, y: cy, size: r, borderColor: CARD.white, borderWidth: 0.75, borderOpacity: 0.32 });
}

function drawPortraitFallback(page: PDFPage, bold: PDFFont, name: string): void {
  const { cx, cy, r } = PORTRAIT;
  const initials = getInitials(name);
  const initialsSize = fitTextSize(bold, initials, 19, 12, r * 1.3);

  page.drawCircle({ x: cx, y: cy, size: r, color: CARD.paneFill });
  page.drawText(initials, {
    x: cx - bold.widthOfTextAtSize(initials, initialsSize) / 2,
    y: cy - initialsSize * 0.36,
    size: initialsSize,
    font: bold,
    color: CARD.white,
    opacity: 0.95,
  });
  drawPortraitRing(page);
}

function drawPortraitPhoto(page: PDFPage, image: PDFImage): void {
  const { cx, cy, r } = PORTRAIT;
  const side = r * 2;
  // Cover-crop into the circle's square, then clip to the circle.
  const scale = Math.max(side / image.width, side / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  page.pushOperators(pushGraphicsState(), ...circlePath(cx, cy, r), clip(), endPath());
  page.drawImage(image, { x: cx - width / 2, y: cy - height / 2, width, height });
  page.pushOperators(popGraphicsState());
  drawPortraitRing(page);
}

export async function buildAgentBusinessCardPdf(data: AgentBusinessCardData): Promise<Uint8Array> {
  const content = getAgentBusinessCardContent(data);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([BUSINESS_CARD_WIDTH_POINTS, BUSINESS_CARD_HEIGHT_POINTS]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const profilePhoto = await embedProfilePhoto(pdf, data.profilePhoto);
  const { margin } = CARD;
  const top = BUSINESS_CARD_HEIGHT_POINTS - margin;

  pdf.setTitle(`${content.name} - PNCL Business Card`);
  pdf.setAuthor("PNCL");
  pdf.setSubject("PNCL agent business card");
  pdf.setCreator("PNCL Agent Portal");

  // The shading extends past both ends, so it paints the whole page: the
  // light in the corner and the flat ink everywhere past 190pt.
  drawWallLight(pdf, page);

  // The wordmark, drawn from the site's own logo path as vectors.
  const logoHeight = 13;
  page.drawSvgPath(LOGO_PATH, {
    x: margin,
    y: top,
    scale: logoHeight / LOGO_VIEWBOX.height,
    color: CARD.white,
  });

  const nameSize = fitTextSize(bold, content.name, 18, 10.5, PORTRAIT.cx - PORTRAIT.r - margin - 10);
  page.drawText(content.name, { x: margin, y: 70, size: nameSize, font: bold, color: CARD.white, opacity: 0.95 });

  // The accent is a spark, as in the portal: one 3pt dot before the role.
  page.drawCircle({ x: margin + 1.6, y: 59.9, size: 1.6, color: CARD.accent });
  drawTracked(page, content.affiliation, { x: margin + 7, y: 58, size: 6, font: bold, opacity: 0.7, tracking: 1.2 });

  page.drawLine({
    start: { x: margin, y: 47 },
    end: { x: BUSINESS_CARD_WIDTH_POINTS - margin, y: 47 },
    color: CARD.white,
    thickness: 0.5,
    opacity: 0.12,
  });

  const contactLines = [
    { label: "EMAIL", value: content.workEmail },
    { label: "PHONE", value: content.phoneNumber },
    ...(content.npn ? [{ label: "NPN", value: content.npn }] : []),
  ];

  contactLines.forEach(({ label, value }, index) => {
    const y = content.npn ? 34 - index * 11 : 32 - index * 13;
    drawContactLine({
      page,
      label,
      value,
      y,
      labelFont: bold,
      valueFont: regular,
    });
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

export async function createAgentBusinessCardPdfFile(data: AgentBusinessCardData): Promise<File> {
  const bytes = await buildAgentBusinessCardPdf(data);
  return new File([new Uint8Array(bytes)], getAgentBusinessCardFileName(data), {
    type: "application/pdf",
  });
}

export function canShareAgentBusinessCardPdfFile(file: File): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }

  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareAgentBusinessCardPdfFile(file: File): Promise<void> {
  // Do not add title, text, or URL: the native share payload must contain only the PDF.
  await navigator.share({ files: [file] });
}

export function downloadAgentBusinessCardPdfFile(file: File): void {
  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export async function downloadAgentBusinessCardPdf(data: AgentBusinessCardData): Promise<void> {
  const file = await createAgentBusinessCardPdfFile(data);
  downloadAgentBusinessCardPdfFile(file);
}
