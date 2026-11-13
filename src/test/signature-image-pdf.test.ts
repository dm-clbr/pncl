import { describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createHash, webcrypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({ getEmailDomain: () => "thepncl.com" }));
vi.stubGlobal("crypto", webcrypto);
import { signDocumentPdf } from "../../supabase/functions/_shared/documentSigningPdf";
import { generateSignedIcaPdf, validateSubmitOnboardingContractPayload } from "../../supabase/functions/_shared/onboardingContract";
import { SIGNATURE_ADOPTION_CONSENT, validateSignatureAdoption, signaturePngBytes } from "../../supabase/functions/_shared/signatureAdoption";

function imagesInAppearance(pdf: PDFDocument, page: number) {
  const objects = pdf.getPage(page).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
  return objects?.values().filter(ref => {
    const stream = pdf.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) return false;
    return Boolean(stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict)?.lookupMaybe(PDFName.of("XObject"), PDFDict));
  }).length ?? 0;
}
function attachments(pdf: PDFDocument) {
  return pdf.context.enumerateIndirectObjects().flatMap(([,object]) => {
    if (!(object instanceof PDFRawStream) || object.dict.get(PDFName.of("Type")) !== PDFName.of("EmbeddedFile")) return [];
    return [JSON.parse(new TextDecoder().decode(decodePDFRawStream(object).decode()))];
  });
}
describe("adopted signature PDF output", () => {
  it.each(["typed", "drawn"] as const)("preserves the exact %s image in every signature box and stores adoption evidence", async method => {
    const image = await readFile(`src/test/fixtures/signatures/${method}.png`);
    const signatureImageBase64 = image.toString("base64");
    const signatureAdoption = { method, accepted: true as const, version: "2026-11-13" as const, name: "Sample Agent" };
    const source = await PDFDocument.create();const page = source.addPage([612,440]);
    page.drawText("SIGNATURE QA - SAMPLE ONLY",{x:50,y:390,size:16});
    for (const [index,y] of [250,120].entries()) { const f=source.getForm().createTextField(`pncl_signature_${index}`);f.addToPage(page,{x:50,y,width:350,height:60});f.enableReadOnly(); }
    const bytes = await source.save();
    const signedAt = new Date("2026-11-13T12:00:00Z");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const input = { signatureAdoption, signatureImageBase64, legalName: "Sample Agent", signatureName: "Sample Agent", personalEmail: "sample@example.invalid", agreementAccepted: true, counselAcknowledged: true };
    const ica = await generateSignedIcaPdf(validateSubmitOnboardingContractPayload(input, true), signedAt, undefined, undefined, { bytes, version: "test", sha256: hash });
    const request = await signDocumentPdf(bytes, { signatureAdoption, signatureImageBase64, name: input.legalName, title: "QA", signedAt: signedAt.toISOString(), requestId: "test", userId: "test", hash });
    for (const output of [ica, request]) {
      const pdf = await PDFDocument.load(output);
      expect(pdf.catalog.has(PDFName.of("AcroForm"))).toBe(false);
      expect(pdf.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
      expect(imagesInAppearance(pdf, 0)).toBe(2);
      const records = attachments(pdf);
      expect(records.some(record => record.imageSha256 === createHash("sha256").update(image).digest("hex"))).toBe(true);
      expect(records.some(record => record.consent === SIGNATURE_ADOPTION_CONSENT || record.adoptionConsent === SIGNATURE_ADOPTION_CONSENT)).toBe(true);
    }
    if (process.env.PNCL_SIGNATURE_QA_DIR) await writeFile(`${process.env.PNCL_SIGNATURE_QA_DIR}/${method}-ica.pdf`, ica);
  });
  it("requires current explicit adoption and rejects changed names or invalid PNGs", () => {
    const signature = { method: "typed", accepted: true, version: "2026-11-13", name: "Sample Agent" };
    for (const value of [null, { ...signature, accepted: false }, { ...signature, version: "old" }, { ...signature, name: "Other Agent" }]) expect(() => validateSignatureAdoption(value, "Sample Agent")).toThrow();
    expect(() => signaturePngBytes(btoa("not PNG"))).toThrow();
  });
});
