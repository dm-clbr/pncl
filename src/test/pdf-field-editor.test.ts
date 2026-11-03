import { describe, it, expect, vi } from "vitest";
import { PDFDocument, PDFName, PDFHexString, degrees } from "pdf-lib";
import { readFile, writeFile } from "node:fs/promises";
import { readPlacedPdfFields, writePlacedPdfFields, fieldRectToPlacement, placementToFieldRect, type PdfPlacedField } from "@/lib/pdf-field-editor";
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
import { fillPdfInputFields } from "../../supabase/functions/_shared/pdfFieldValues";
import { signDocumentPdf } from "../../supabase/functions/_shared/documentSigningPdf";
const field = (type: PdfPlacedField["type"], patch: Partial<PdfPlacedField> = {}): PdfPlacedField => ({ id: `pncl_${type}_test:0`, name: `pncl_${type}_test`, label: type === "text" ? "Agent office" : type, type, page: 1, x: .1, y: .2, width: .4, height: .04, required: true, locked: false, original: false, widget: 0, ...patch });
async function blank() { const pdf = await PDFDocument.create(); pdf.addPage([612,792]).drawText("SAMPLE FIELD LAYOUT - TEST ONLY", {x:50,y:730,size:16}); pdf.addPage([400,600]); return pdf.save(); }
describe("PDF field placement", () => {
  it("persists field labels, required status, types, page, and geometry in the uploaded PDF itself", async () => {
    const source = await blank();
    const output = await writePlacedPdfFields(source, [field("text"),field("checkbox",{page:2,x:.2,y:.4,width:.05,height:.04})]);
    const loaded = await readPlacedPdfFields(output);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toMatchObject({label:"Agent office", required:true});
    for (const key of ["x","y","width","height"] as const) expect(loaded[0][key]).toBeCloseTo(field("text")[key]);
    expect(loaded[1]).toMatchObject({type:"checkbox",page:2});
    const widget = (await PDFDocument.load(output)).getForm().getTextField("pncl_text_test").acroField.getWidgets()[0];
    expect(widget.dict.lookup(PDFName.of("TU"), PDFHexString).decodeText()).toBe("Agent office");
    expect((await readPlacedPdfFields(source))).toHaveLength(0);
  });
  it("moves and resizes existing fields, and removes deleted fields without dangling widgets", async () => {
    const bytes = await writePlacedPdfFields(await blank(), [field("text"),field("initials")]);
    const existing = await readPlacedPdfFields(bytes);
    const moved = await writePlacedPdfFields(bytes,[{...existing[0],page:2,x:.3,y:.5,width:.5,height:.06}]);
    const reloaded = await readPlacedPdfFields(moved);
    expect(reloaded).toHaveLength(1); expect(reloaded[0]).toMatchObject({page:2,x:.3,y:.5,width:.5}); expect(reloaded[0].height).toBeCloseTo(.06);
    const pdf = await PDFDocument.load(moved);
    expect(pdf.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
  });
  it("can reposition imported widgets without an optional page pointer", async () => {
    const pdf = await PDFDocument.load(await writePlacedPdfFields(await blank(), [field("text")]));
    pdf.getForm().getTextField("pncl_text_test").acroField.getWidgets()[0].dict.delete(PDFName.of("P"));
    const bytes = await pdf.save(), existing = await readPlacedPdfFields(bytes);
    const moved = await writePlacedPdfFields(bytes, [{ ...existing[0], x: .25, page: 2 }]);
    expect((await readPlacedPdfFields(moved))[0]).toMatchObject({ x: .25, page: 2 });
  });
  it.each([0,90,180,270])("keeps the field at the same visual position on a page rotated %i degrees", async angle => {
    const pdf = await PDFDocument.create(), page = pdf.addPage([600,800]); page.setRotation(degrees(angle)); page.setCropBox(10,20,560,740);
    const original = {x:100,y:150,width:180,height:25};
    const placement = fieldRectToPlacement(page,original);
    const result = placementToFieldRect(page,placement);
    for (const key of ["x","y","width","height"] as const) expect(result[key]).toBeCloseTo(original[key]);
  });
  it("keeps the standard W-9 data fields while allowing position changes", async () => {
    const bytes = Uint8Array.from(await readFile("public/documents/pncl-w9-standard.pdf"));
    const fields = await readPlacedPdfFields(bytes,"w9");
    expect(fields.every(field=>field.locked)).toBe(true);
    await expect(writePlacedPdfFields(bytes, fields.slice(1),"w9")).rejects.toThrow("existing required form fields");
    const output = await writePlacedPdfFields(bytes,fields.map(field=>field.name==="signature"?{...field,x:.22,width:.35}:field),"w9");
    expect((await readPlacedPdfFields(output,"w9")).find(field=>field.name==="signature")?.x).toBeCloseTo(.22);
  });
});
describe("authored PDF inputs at signing",()=>{
  it("requires authored fields, checks initials, rejects unknown values, and uses the server signature/date", async()=>{
    const bytes = await writePlacedPdfFields(await blank(),[field("text"),field("checkbox"),field("initials"),field("signature"),field("date")]);
    const fill = async(values:unknown)=>fillPdfInputFields(await PDFDocument.load(bytes),values,"Sample Agent",new Date("2026-11-03T12:00:00Z"));
    await expect(fill({})).rejects.toThrow("Agent office is required");
    await expect(fill({unknown:"injected"})).rejects.toThrow("does not belong");
    await expect(fill({pncl_text_test:"Office A",pncl_checkbox_test:true,pncl_initials_test:"YES"})).rejects.toThrow("actual initials");
    expect(await fill({pncl_text_test:"Office A",pncl_checkbox_test:true,pncl_initials_test:"SA",pncl_signature_test:"Fake Name",pncl_date_test:"2099"})).toEqual({pncl_text_test:"Office A",pncl_checkbox_test:true,pncl_initials_test:"SA",pncl_signature_test:"Sample Agent",pncl_date_test:"2026-11-03"});
  });
  it("produces a completed static PDF with all entered fields and a signature record",async()=>{
    const bytes=await writePlacedPdfFields(await blank(),[field("text",{y:.2}),field("initials",{y:.3,width:.12}),field("signature",{y:.4}),field("date",{y:.5}),field("checkbox",{y:.6,width:.04,height:.03})]);
    const signed=await signDocumentPdf(bytes,{name:"Sample Agent",title:"Field layout QA",signedAt:"2026-11-03T12:00:00Z",userId:"sample",requestId:"qa",hash:"sample-hash",fieldValues:{pncl_text_test:"Office A",pncl_initials_test:"SA",pncl_checkbox_test:true}});
    const pdf=await PDFDocument.load(signed);expect(pdf.getPageCount()).toBe(3);expect(pdf.catalog.has(PDFName.of("AcroForm"))).toBe(false);
    expect(pdf.getPage(0).node.Annots()?.size()??0).toBe(0);
    if(process.env.PNCL_FIELD_QA_DIR){await writeFile(`${process.env.PNCL_FIELD_QA_DIR}/fields-source.pdf`,bytes);await writeFile(`${process.env.PNCL_FIELD_QA_DIR}/fields-signed.pdf`,signed);}
  });
});
