import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { customPdfFieldType, type PdfFieldValues } from "../../supabase/functions/_shared/pdfFieldRules";

/** Preserve custom inputs across pdf.js page virtualization, including fields
 * outside the standard ICA/W-9 pages. The server validates the source schema. */
export async function readCustomPdfInputValues(pdf: PDFDocumentProxy, container: HTMLElement): Promise<PdfFieldValues> {
  const objects = await pdf.getFieldObjects(); const result: PdfFieldValues = {};
  for (const [name, entries] of Object.entries(objects ?? {})) {
    const type = customPdfFieldType(name);
    if (!type || type === "signature" || type === "date") continue;
    const field = entries[0] as { id: string; value?: string | boolean } | undefined; if (!field) continue;
    const input = container.querySelector<HTMLInputElement>(`[id="pdfjs_internal_id_${field.id}"]`);
    const stored = pdf.annotationStorage.getValue(field.id, { value: field.value }) as { value?: string | boolean };
    const value = input ? type === "checkbox" ? input.checked : input.value : stored.value;
    result[name] = type === "checkbox" ? value === true || value === "Yes" || value === "On" : String(value ?? "");
  }
  return result;
}
