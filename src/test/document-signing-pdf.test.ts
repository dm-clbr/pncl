import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { webcrypto } from "node:crypto";
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
import { decodeSigningPdf, sha256, signDocumentPdf } from "../../supabase/functions/_shared/documentSigningPdf";
afterEach(() => vi.unstubAllGlobals());
describe("document signature PDF", () => {
  it("keeps source pages intact and appends a certificate for the exact document", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const pdf = await PDFDocument.create(); pdf.addPage([400,600]); pdf.addPage([600,400]);
    const bytes = await pdf.save();
    const decoded = await decodeSigningPdf(Buffer.from(bytes).toString("base64"));
    const hash = await sha256(decoded);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const signed = await signDocumentPdf(decoded, { title: "Test addendum", name: "María O’Connor", signedAt: "2026-11-03T18:00:00Z", requestId: "test", userId: "agent", hash });
    const result = await PDFDocument.load(signed);
    expect(result.getPageCount()).toBe(3);
    expect(result.getPage(0).getSize()).toEqual({ width:400, height:600 });
    expect(result.getPage(1).getSize()).toEqual({ width:600, height:400 });
    expect(result.catalog.lookup(PDFName.of("Names"), PDFDict).has(PDFName.of("EmbeddedFiles"))).toBe(true);
  });
  it("rejects disguised and empty PDFs", async () => {
    await expect(decodeSigningPdf(btoa("not a pdf"))).rejects.toThrow();
    await expect(decodeSigningPdf("%PDF- invalid data")).rejects.toThrow();
  });
});
