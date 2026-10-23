import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({ getEmailDomain: () => "thepncl.com" }));
import { generateSignedIcaPdf, validateSubmitOnboardingContractPayload } from "../../supabase/functions/_shared/onboardingContract";

const signature = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const payload = {
  legalName: "Sample Agent", personalEmail: "sample@example.invalid", signatureName: "Sample Agent",
  signatureImageBase64: signature, agreementAccepted: true, counselAcknowledged: true,
  debitCheckInitials: { a: "SA", b: "SA", c: "SA", d: "SA", e: "SA" },
};
afterEach(() => vi.unstubAllGlobals());

describe("custom ICA signing", () => {
  it("preserves the source pages and appends a signature record without requiring standard-template fields", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    source.addPage([400, 600]).drawText("SAMPLE IBO ICA - TEST ONLY", { x: 30, y: 550, font, size: 15 });
    source.addPage([600, 400]).drawText("Second source page - TEST ONLY", { x: 30, y: 350, font, size: 15 });
    const bytes = await source.save();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const validated = validateSubmitOnboardingContractPayload({ ...payload, debitCheckInitials: undefined }, true);
    const signed = await generateSignedIcaPdf(validated, new Date("2026-10-22T16:00:00Z"), { ipAddress: "192.0.2.1", userAgent: "PNCL automated test" }, undefined, { bytes, sha256, version: "custom-ibo-test" });
    const document = await PDFDocument.load(signed);
    expect(document.getPageCount()).toBe(3);
    expect(document.getPage(0).getSize()).toEqual({ width: 400, height: 600 });
    expect(document.getPage(1).getSize()).toEqual({ width: 600, height: 400 });
    expect(document.getPage(2).getSize()).toEqual({ width: 612, height: 792 });
    if (process.env.PNCL_PDF_QA_OUTPUT) await writeFile(process.env.PNCL_PDF_QA_OUTPUT, signed);
  });
  it("still requires the standard ICA initials and produces the existing signed template", async () => {
    vi.stubGlobal("Deno", { env: { get: () => undefined }, readFile: async () => Uint8Array.from(await readFile("public/documents/pncl-ica-standard.pdf")) });
    expect(() => validateSubmitOnboardingContractPayload({ ...payload, debitCheckInitials: undefined })).toThrow("initials");
    const signed = await generateSignedIcaPdf(validateSubmitOnboardingContractPayload(payload), new Date("2026-10-22T16:00:00Z"));
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(15);
  });
});
