import { PDFDocument, PDFTextField, PDFCheckBox, PDFName, PDFString, PDFHexString, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { customPdfFieldType, type PdfFieldValues } from "./pdfFieldRules.ts";
import { icaInitialsError, normalizeIcaInitials } from "./icaSigningRules.ts";

/** Values are accepted only for fields actually embedded in the reviewed PDF.
 * Signature/date fields are derived from the signing event, never the request. */
export async function fillPdfInputFields(pdf: PDFDocument, input: unknown, signer: string, signedAt: Date, extraOnly = false): Promise<PdfFieldValues> {
  if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input))) throw new Error("Invalid PDF field values.");
  const values = (input ?? {}) as PdfFieldValues, saved: PdfFieldValues = {};
  const controls = pdf.getForm().getFields().filter(field => {
    const custom = customPdfFieldType(field.getName());
    return (field instanceof PDFTextField || field instanceof PDFCheckBox) && (!extraOnly || custom) && (!field.isReadOnly() || custom === "signature" || custom === "date");
  });
  if (controls.length > 150 || Object.keys(values).length > 150) throw new Error("Too many PDF input fields.");
  const allowed = new Set(controls.map(field => field.getName()));
  if (Object.keys(values).some(name => !allowed.has(name))) throw new Error("A submitted field does not belong to this PDF. Reload the document.");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const control of controls) {
    const name = control.getName(), type = customPdfFieldType(name);
    const alias = control.acroField.dict.get(PDFName.of("TU"));
    const label = alias instanceof PDFString || alias instanceof PDFHexString ? alias.decodeText() : name;
    if (control instanceof PDFCheckBox) {
      const value = values[name] ?? control.isChecked();
      if (typeof value !== "boolean") throw new Error(`${label}: choose checked or unchecked.`);
      if (control.isRequired() && !value) throw new Error(`${label} is required.`);
      if (value) control.check();
      else control.uncheck();
      saved[name] = value;
    } else if (control instanceof PDFTextField) {
      const supplied = type === "signature" ? signer : type === "date" ? signedAt.toISOString().slice(0, 10) : values[name] ?? control.getText() ?? "";
      if (typeof supplied !== "string" || supplied.length > 500 || Array.from(supplied).some(char => {
        const code = char.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13;
      })) throw new Error(`${label}: use text of 500 characters or fewer.`);
      let value = supplied.trim();
      if (control.isRequired() && !value) throw new Error(`${label} is required.`);
      if (type === "initials" && value) { const error = icaInitialsError(value, signer, label); if (error) throw new Error(error); value = normalizeIcaInitials(value); }
      control.setText(value);
      if (type && value) {
        const rect = control.acroField.getWidgets()[0]?.getRectangle();
        if (rect) control.setFontSize(Math.max(4, Math.min(11, rect.height * .65, (rect.width - 6) / Math.max(1, font.widthOfTextAtSize(value, 1)))));
      }
      saved[name] = value;
    }
  }
  if (controls.length) await pdf.attach(Uint8Array.from(new TextEncoder().encode(JSON.stringify(saved, null, 2))), "completed-input-fields.json", { mimeType: "application/json", description: "Input fields completed for this exact signed document" });
  return saved;
}
