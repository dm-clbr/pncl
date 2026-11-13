import { SIGNATURE_ADOPTION_CONSENT, signaturePngBytes, type SignatureAdoption } from "./signatureAdoption.ts";
import { fillPdfInputFields } from "./pdfFieldValues.ts";
import { flattenSigningForm } from "./onboardingSigningPdf.ts";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { DOCUMENT_CONSENT, MAX_DOCUMENT_BYTES } from "./documentRequestRules.ts";

export async function decodeSigningPdf(value: unknown): Promise<Uint8Array> {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 + 100) throw new Error("Choose a PDF of 10 MB or smaller.");
  const encoded = value.replace(/^data:application\/pdf;base64,/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Choose a valid PDF.");
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  if (bytes.length > MAX_DOCUMENT_BYTES || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Choose a PDF of 10 MB or smaller.");
  const pdf = await PDFDocument.load(bytes);
  if (!pdf.getPageCount()) throw new Error("The PDF must have at least one page.");
  return bytes;
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
// Fill only authored form fields, then append the signature certificate.
export async function signDocumentPdf(bytes: Uint8Array, input: {
  signatureAdoption?: SignatureAdoption; signatureImageBase64?: string;
  fieldValues?: Record<string, string | boolean>;
  title: string; name: string; signedAt: string; requestId: string; hash: string; userId: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  await fillPdfInputFields(pdf, input.fieldValues, input.name, new Date(input.signedAt), false, input.signatureImageBase64);
  if (pdf.getForm().getFields().length) flattenSigningForm(pdf);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Keep the exact UTF-8 signature in the attached audit record even for names
  // outside the standard PDF font's character set.
  const printable = (value: string) => Array.from(value).map(char => {
    try { font.encodeText(char); return char; } catch { return `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`; }
  }).join("");
  let page = pdf.addPage([612, 792]);
  let y = 735;
  const line = (value: string, heading = false) => {
    const usedFont = heading ? bold : font;
    let pending = "";
    const draw = () => {
      if (y < 60) { page = pdf.addPage([612, 792]); y = 735; }
      page.drawText(pending, { x: 54, y, size: heading ? 14 : 10, font: usedFont }); y -= heading ? 24 : 16; pending = "";
    };
    for (const char of printable(value)) {
      if (usedFont.widthOfTextAtSize(pending + char, heading ? 14 : 10) > 500) draw();
      pending += char;
    }
    if (pending) draw();
    y -= 8;
  };
  line("Electronic signature record", true);
  line(input.title, true);
  line(`Signed by: ${input.name}`);
  line(`Signed at (UTC): ${input.signedAt}`);
  line(`Request: ${input.requestId}`);
  line(`Agent: ${input.userId}`);
  line(`Original document SHA-256: ${input.hash}`);
  line(DOCUMENT_CONSENT);
  if (input.signatureAdoption && input.signatureImageBase64) {
    line(SIGNATURE_ADOPTION_CONSENT);
    line(`Adopted ${input.signatureAdoption.method} signature | Consent version: ${input.signatureAdoption.version}`);
    if (y < 190) { page = pdf.addPage([612, 792]); y = 735; }
    const signature = await pdf.embedPng(signaturePngBytes(input.signatureImageBase64));
    const dimensions = signature.scaleToFit(468, 100);
    page.drawImage(signature, { x: 54, y: y - dimensions.height, ...dimensions });
  }
  const { signatureImageBase64, ...record } = input;
  const imageSha256 = signatureImageBase64 ? await sha256(signaturePngBytes(signatureImageBase64)) : undefined;
  await pdf.attach(Uint8Array.from(new TextEncoder().encode(JSON.stringify({ ...record, imageSha256, consent: DOCUMENT_CONSENT, adoptionConsent: input.signatureAdoption ? SIGNATURE_ADOPTION_CONSENT : undefined }, null, 2))), "signature-record.json", {
    mimeType: "application/json", description: "Electronic signature record, including the exact legal name in UTF-8",
  });
  return pdf.save();
}
