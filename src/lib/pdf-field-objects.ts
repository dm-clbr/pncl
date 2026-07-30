import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * pdf.js declares `getFieldObjects()` entries as bare `Object`, so every
 * property read off a descriptor is a type error. These are the AcroForm
 * properties the ICA and W-9 flows actually rely on.
 */
export interface PdfFieldObject {
  id: string;
  value?: unknown;
}

export type PdfFieldObjects = Record<string, PdfFieldObject[] | undefined>;

export async function getPdfFieldObjects(
  pdfDocument: PDFDocumentProxy,
): Promise<PdfFieldObjects | null> {
  return (await pdfDocument.getFieldObjects()) as PdfFieldObjects | null;
}
