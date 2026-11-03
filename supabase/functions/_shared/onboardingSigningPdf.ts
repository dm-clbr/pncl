import { PDFDocument, PDFTextField, PDFCheckBox, PDFDict, PDFName } from "https://esm.sh/pdf-lib@1.17.1";
import { ICA_FORM_FIELDS } from "./icaFormFields.ts";
import { W9_FORM_FIELD_SUFFIXES, W9_TAX_CLASS_CHECKBOX_KEYS, getPdfLibFieldName } from "./w9FormFields.ts";
import type { SigningDocumentKind, SigningMode } from "./onboardingSigningRules.ts";

/** Only use the mapped ICA experience for its known page/field arrangement. */
export function hasMappedIcaFields(pdf: PDFDocument): boolean {
  const form = pdf.getForm();
  if (pdf.getPageCount() !== 14) return false;
  try {
    const introduction = [ICA_FORM_FIELDS.day, ICA_FORM_FIELDS.month, ICA_FORM_FIELDS.yearLast2, ICA_FORM_FIELDS.introName] as readonly string[];
    const execution = [ICA_FORM_FIELDS.fullName, ICA_FORM_FIELDS.email, ICA_FORM_FIELDS.executionSignature] as readonly string[];
    for (const name of Object.values(ICA_FORM_FIELDS)) {
      const index = introduction.includes(name) ? 1 : execution.includes(name) ? 11 : 13;
      const widgets = form.getTextField(name).acroField.getWidgets();
      if (!widgets.length || widgets.some(widget => widget.P()?.toString() !== pdf.getPage(index).ref.toString())) return false;
    }
    return true;
  } catch { return false; }
}

export async function inspectSigningPdf(bytes: Uint8Array, kind: SigningDocumentKind): Promise<SigningMode> {
  const pdf = await PDFDocument.load(bytes);
  if (pdf.getPageCount() < 1 || pdf.getPageCount() > 100) throw new Error("Signing documents must contain 1–100 pages.");
  if (kind === "ica") return hasMappedIcaFields(pdf) ? "ica_fields" : "signature_record";
  if (kind !== "w9") return "signature_record";
  const form = pdf.getForm();
  // W-9 collects structured tax data. Reject incompatible uploads up front,
  // rather than producing a PDF with missing tax fields at signing time.
  for (const key of Object.keys(W9_FORM_FIELD_SUFFIXES) as (keyof typeof W9_FORM_FIELD_SUFFIXES)[]) {
    const name = getPdfLibFieldName(form, key);
    const field = name ? form.getField(name) : null;
    const checkbox = (W9_TAX_CLASS_CHECKBOX_KEYS as readonly string[]).includes(key) || key === "hasForeignPartners";
    if (!field || (checkbox ? !(field instanceof PDFCheckBox) : !(field instanceof PDFTextField))) {
      throw new Error(`The W-9 PDF needs a fillable ${key} field. Upload a compatible fillable W-9 with signature and date fields.`);
    }
    const widgets = field.acroField.getWidgets();
    if (!widgets.length || widgets.some(widget => widget.P()?.toString() !== pdf.getPage(0).ref.toString())) {
      throw new Error("W-9 form fields must be on the first page. Upload a compatible fillable W-9.");
    }
  }
  return "w9_fields";
}

export function signatureFieldRects(pdf: PDFDocument, names: string[]) {
  return names.flatMap(name => pdf.getForm().getTextField(name).acroField.getWidgets().map(widget => {
    const pageIndex = pdf.getPages().findIndex(page => page.ref.toString() === widget.P()?.toString());
    if (pageIndex < 0) throw new Error("The uploaded signature field is missing its page.");
    return { pageIndex, ...widget.getRectangle() };
  }));
}

/** Flatten completed forms and remove their widget references as well as fields.
 * pdf-lib can leave dangling /Annots references for separately created widgets. */
export function flattenSigningForm(pdf: PDFDocument): void {
  const widgetsByPage = pdf.getPages().map(page => {
    const refs = new Set<string>();
    const annotations = page.node.Annots();
    for (let i = 0; i < (annotations?.size() ?? 0); i++) {
      const ref = annotations!.get(i);
      const annotation = pdf.context.lookup(ref);
      if (annotation instanceof PDFDict && annotation.get(PDFName.of("Subtype")) === PDFName.of("Widget")) refs.add(ref.toString());
    }
    return { page, refs };
  });
  pdf.getForm().flatten();
  for (const { page, refs } of widgetsByPage) {
    const annotations = page.node.Annots();
    for (let i = (annotations?.size() ?? 0) - 1; i >= 0; i--) {
      if (refs.has(annotations!.get(i).toString())) annotations!.remove(i);
    }
  }
  pdf.catalog.delete(PDFName.of("AcroForm"));
}
