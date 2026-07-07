import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const COMP_ATTACHMENT_BUCKET = "portal-profile-documents";
export const COMP_AGREEMENT_TODO_SLUG = "comp_agreement";

export type CompAttachmentStatus = "pending" | "signed";

export interface CompAttachmentRecord {
  id: string;
  user_id: string;
  title: string;
  unsigned_pdf_path: string;
  signed_pdf_path: string | null;
  status: CompAttachmentStatus;
  assigned_by: string | null;
  assigned_at: string;
  signature_name: string | null;
  signed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompAttachmentSummary {
  id: string;
  userId: string;
  title: string;
  status: CompAttachmentStatus;
  assignedAt: string;
  signatureName: string | null;
  signedAt: string | null;
}

export function mapCompAttachmentSummary(record: CompAttachmentRecord): CompAttachmentSummary {
  return {
    id: record.id,
    userId: record.user_id,
    title: record.title,
    status: record.status,
    assignedAt: record.assigned_at,
    signatureName: record.signature_name,
    signedAt: record.signed_at,
  };
}

export function getCompAttachmentUnsignedPath(userId: string, attachmentId: string): string {
  return `${userId}/comp-attachments/${attachmentId}.pdf`;
}

export function getCompAttachmentSignedPath(userId: string, attachmentId: string): string {
  return `${userId}/comp-attachments/${attachmentId}-signed.pdf`;
}

export async function createCompAttachmentSignedUrl(
  adminClient: SupabaseClient,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await adminClient.storage
    .from(COMP_ATTACHMENT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create download link");
  }

  return data.signedUrl;
}

/**
 * Stamps the agent's typed signature onto the last page of the assigned comp
 * attachment PDF and appends an electronic signature record page.
 */
export async function generateSignedCompAttachmentPdf(
  unsignedPdfBytes: Uint8Array,
  input: {
    title: string;
    signatureName: string;
    signedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(unsignedPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const scriptFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const signedDate = input.signedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  if (lastPage) {
    const stampX = 48;
    const stampY = 36;
    lastPage.drawText(input.signatureName, {
      x: stampX,
      y: stampY + 26,
      size: 16,
      font: scriptFont,
      color: rgb(0.1, 0.1, 0.35),
    });
    lastPage.drawText(
      `Electronically signed by ${input.signatureName} on ${signedDate}`,
      {
        x: stampX,
        y: stampY + 12,
        size: 8,
        font,
        color: rgb(0.25, 0.25, 0.25),
      },
    );
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
  certPage.drawText(input.title, {
    x: 72,
    y,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 36;

  const drawEntry = (label: string, value: string) => {
    certPage.drawText(label, { x: 72, y, size: 9, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
    certPage.drawText(value, { x: 72, y: y - 14, size: 11, font, color: rgb(0, 0, 0) });
    y -= 34;
  };

  drawEntry("Signature", input.signatureName);
  drawEntry("Signed at (UTC)", input.signedAt.toISOString());
  if (input.ipAddress) drawEntry("IP address", input.ipAddress);
  if (input.userAgent) {
    const truncated = input.userAgent.length > 120
      ? `${input.userAgent.slice(0, 117)}...`
      : input.userAgent;
    drawEntry("User agent", truncated);
  }

  certPage.drawText(
    "The contractor confirmed they reviewed the compensation attachment and agreed to its terms by typing their legal name as an electronic signature.",
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

const PDF_BASE64_PATTERN = /^(?:data:application\/pdf;base64,)?([A-Za-z0-9+/]+=*)$/;
// ~10 MB decoded.
const MAX_COMP_ATTACHMENT_BASE64_LENGTH = 14_400_000;

export function decodeCompAttachmentPdf(value: unknown): Uint8Array {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A PDF file is required");
  }

  const match = value.trim().match(PDF_BASE64_PATTERN);
  if (!match) {
    throw new Error("The comp attachment must be a PDF file");
  }

  const base64 = match[1];
  if (base64.length > MAX_COMP_ATTACHMENT_BASE64_LENGTH) {
    throw new Error("The comp attachment must be 10 MB or smaller");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Quick sanity check for a PDF header.
  const header = String.fromCharCode(...bytes.slice(0, 5));
  if (header !== "%PDF-") {
    throw new Error("The uploaded file is not a valid PDF");
  }

  return bytes;
}
