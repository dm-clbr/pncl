export const PDF_FIELD_TYPES = ["text", "signature", "initials", "date", "checkbox"] as const;
export type PdfFieldType = typeof PDF_FIELD_TYPES[number];
export type PdfFieldValues = Record<string, string | boolean>;
export function customPdfFieldType(name: string): PdfFieldType | null {
  const type = /^pncl_(text|signature|initials|date|checkbox)_/.exec(name)?.[1];
  return (type as PdfFieldType | undefined) ?? null;
}
export function pdfFieldLabel(name: string): string {
  return customPdfFieldType(name) ?? name.split(".").pop() ?? name;
}
export interface PdfPlacedField {
  id: string; name: string; label: string; type: PdfFieldType;
  page: number; x: number; y: number; width: number; height: number;
  required: boolean; locked: boolean; original: boolean; widget: number;
}
export function boundPdfField(field: PdfPlacedField): PdfPlacedField {
  const width = Math.max(.005, Math.min(1, field.width));
  const height = Math.max(.005, Math.min(1, field.height));
  return { ...field, width, height, x: Math.max(0, Math.min(1 - width, field.x)), y: Math.max(0, Math.min(1 - height, field.y)) };
}
