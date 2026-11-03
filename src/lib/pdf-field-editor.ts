import { PDFDocument, PDFTextField, PDFCheckBox, PDFRef, PDFName, PDFString, PDFHexString, type PDFPage } from "pdf-lib";
import { ICA_FORM_FIELDS } from "../../supabase/functions/_shared/icaFormFields";
import { W9_FORM_FIELD_SUFFIXES } from "./w9-form-fields";
import { customPdfFieldType, type PdfPlacedField } from "../../supabase/functions/_shared/pdfFieldRules";
export type { PdfPlacedField, PdfFieldType } from "../../supabase/functions/_shared/pdfFieldRules";

function point(page: PDFPage, x: number, y: number, inverse = false): [number, number] {
  const box = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  if (!inverse) {
    x -= box.x; y -= box.y;
    return rotation === 90 ? [y, x] : rotation === 180 ? [box.width - x, y] : rotation === 270 ? [box.height - y, box.width - x] : [x, box.height - y];
  }
  const pair = rotation === 90 ? [y, x] : rotation === 180 ? [box.width - x, y] : rotation === 270 ? [box.width - y, box.height - x] : [x, box.height - y];
  return [pair[0] + box.x, pair[1] + box.y];
}
function size(page: PDFPage) {
  const box = page.getCropBox();
  return page.getRotation().angle % 180 ? { width: box.height, height: box.width } : box;
}
export function fieldRectToPlacement(page: PDFPage, rect: { x: number; y: number; width: number; height: number }) {
  const a = point(page, rect.x, rect.y), b = point(page, rect.x + rect.width, rect.y + rect.height), dimensions = size(page);
  return { x: Math.min(a[0], b[0]) / dimensions.width, y: Math.min(a[1], b[1]) / dimensions.height, width: Math.abs(a[0] - b[0]) / dimensions.width, height: Math.abs(a[1] - b[1]) / dimensions.height };
}
export function placementToFieldRect(page: PDFPage, field: Pick<PdfPlacedField, "x" | "y" | "width" | "height">) {
  const dimensions = size(page);
  const a = point(page, field.x * dimensions.width, field.y * dimensions.height, true);
  const b = point(page, (field.x + field.width) * dimensions.width, (field.y + field.height) * dimensions.height, true);
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
}
export async function readPlacedPdfFields(bytes: Uint8Array, kind?: string): Promise<PdfPlacedField[]> {
  const pdf = await PDFDocument.load(bytes);
  const fields: PdfPlacedField[] = [];
  for (const field of pdf.getForm().getFields()) {
    if (!(field instanceof PDFTextField) && !(field instanceof PDFCheckBox)) continue;
    const name = field.getName();
    const alias = field.acroField.dict.get(PDFName.of("TU"));
    const coreKey = kind === "ica" ? Object.entries(ICA_FORM_FIELDS).find(([,value])=>value===name)?.[0] : kind === "w9" ? Object.entries(W9_FORM_FIELD_SUFFIXES).find(([,suffix])=>name.endsWith(suffix))?.[0] : undefined;
    const friendly = coreKey?.replace(/([A-Z])/g," $1").replace(/^./, char=>char.toUpperCase()).replace(/Ssn/g,"SSN").replace(/Ein/g,"EIN");
    const label = friendly ?? (alias instanceof PDFString || alias instanceof PDFHexString ? alias.decodeText() : name);
    const coreType = coreKey && /signature/i.test(coreKey) ? /date/i.test(coreKey) ? "date" : "signature" : coreKey && /^initial/.test(coreKey) ? "initials" : null;
    const core = kind === "ica" ? Object.values(ICA_FORM_FIELDS).includes(name as never) : kind === "w9" ? Object.values(W9_FORM_FIELD_SUFFIXES).some(suffix => name.endsWith(suffix)) : false;
    const widgets = field.acroField.getWidgets();
    for (let i = 0; i < widgets.length; i++) {
      const widget = widgets[i];
      const pageIndex = pdf.getPages().findIndex(page => page.ref.toString() === widget.P()?.toString() || page.node.Annots()?.asArray().some(ref => pdf.context.lookup(ref) === widget.dict));
      if (pageIndex < 0) continue;
      fields.push({ id: `${name}:${i}`, name, label, type: customPdfFieldType(name) ?? coreType ?? (field instanceof PDFCheckBox ? "checkbox" : "text"), page: pageIndex + 1, ...fieldRectToPlacement(pdf.getPage(pageIndex), widget.getRectangle()), required: field.isRequired(), locked: core || widgets.length > 1, original: true, widget: i });
    }
  }
  return fields;
}
export async function writePlacedPdfFields(bytes: Uint8Array, fields: PdfPlacedField[], kind?: string): Promise<Uint8Array> {
  if (fields.length > 150) throw new Error("Use no more than 150 input fields.");
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const originals = await readPlacedPdfFields(bytes, kind);
  for (const original of originals) {
    if (original.locked && !fields.some(field => field.id === original.id && field.page === original.page && field.name === original.name)) throw new Error("Keep the existing required form fields on their original pages.");
    if (!fields.some(field => field.name === original.name)) {
      const old = form.getFieldMaybe(original.name);
      if (old) {
        // Remove actual widget refs before removing the field (pdf-lib leaves
        // some separate widget refs behind otherwise).
        for (const page of pdf.getPages()) {
          const annots = page.node.Annots();
          for (let i = (annots?.size() ?? 0) - 1; i >= 0; i--) if (old.acroField.getWidgets().some(widget => widget.dict === pdf.context.lookup(annots!.get(i)))) annots!.remove(i);
        }
        form.removeField(old);
      }
    }
  }
  for (const input of fields) {
    if (![input.x, input.y, input.width, input.height, input.page].every(Number.isFinite) || input.page < 1 || input.page > pdf.getPageCount() || !Number.isInteger(input.page)) throw new Error("Choose a valid page and position for each field.");
    if (input.x < 0 || input.y < 0 || input.width <= 0 || input.height <= 0 || input.x + input.width > 1.000001 || input.y + input.height > 1.000001) throw new Error("Keep every field inside its PDF page.");
    const field = input, page = pdf.getPage(field.page - 1), rect = placementToFieldRect(page, field);
    let control = form.getFieldMaybe(field.name);
    if (field.original) {
      if (!control) throw new Error("An original PDF field is missing. Reopen the editor.");
      const widget = control.acroField.getWidgets()[field.widget];
      if (!widget) throw new Error("An original PDF field is missing.");
      const oldPage = pdf.getPages().find(candidate => candidate.ref.toString() === widget.P()?.toString() || candidate.node.Annots()?.asArray().some(ref => pdf.context.lookup(ref) === widget.dict));
      if (oldPage !== page) {
        const refs = oldPage?.node.Annots();
        const widgetRef = refs?.asArray().find(ref => pdf.context.lookup(ref) === widget.dict);
        if (!(widgetRef instanceof PDFRef)) throw new Error("This field cannot be moved between pages.");
        refs!.remove(refs!.indexOf(widgetRef)!); page.node.addAnnot(widgetRef); widget.setP(page.ref);
      }
      widget.setRectangle(rect);
    } else {
      if (control) throw new Error("Duplicate field name.");
      control = field.type === "checkbox" ? form.createCheckBox(field.name) : form.createTextField(field.name);
      if (control instanceof PDFTextField || control instanceof PDFCheckBox) control.addToPage(page, { ...rect, borderWidth: .5 });
      control.acroField.getWidgets()[0].setRectangle(rect);
      if (control instanceof PDFTextField) { control.setFontSize(Math.min(11, Math.max(6, rect.height * .6))); control.setMaxLength(field.type === "initials" ? 20 : 500); }
    }
    if (!field.locked) {
      const label = PDFHexString.fromText(field.label.trim().slice(0, 80) || field.type);
      control.acroField.dict.set(PDFName.of("TU"), label);
      // PDF.js reads tooltips from each widget rather than the parent field.
      for (const widget of control.acroField.getWidgets()) widget.dict.set(PDFName.of("TU"), label);
      if (field.required) control.enableRequired();
      else control.disableRequired();
      if (field.type === "signature" || field.type === "date") control.enableReadOnly();
    }
    const before = originals.find(original => original.id === field.id);
    if (control instanceof PDFTextField && (!before || ["x", "y", "width", "height"].some(key => before[key as "x"] !== field[key as "x"]))) control.updateAppearances(await pdf.embedFont("Helvetica"));
  }
  return pdf.save();
}
