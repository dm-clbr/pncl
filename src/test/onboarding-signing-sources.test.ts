import { describe, it, expect, vi } from "vitest";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({ getEmailDomain: () => "thepncl.com" }));
import { inspectSigningPdf, signatureFieldRects } from "../../supabase/functions/_shared/onboardingSigningPdf";
import { requireSigningAsset, assertSigningAsset } from "../../supabase/functions/_shared/onboardingSigningRules";
import { generateSignedIcaPdf } from "../../supabase/functions/_shared/onboardingContract";
import { generateSignedW9Pdf } from "../../supabase/functions/_shared/portalW9Pdf";
import { generateDirectDepositPdf } from "../../supabase/functions/_shared/portalDirectDeposit";
import { loadOnboardingContent, loadPortalSigningSource, downloadIcaAsset } from "../../supabase/functions/_shared/onboardingContent";

const fixture = async (name: string) => Uint8Array.from(await readFile(`public/documents/pncl-${name}-standard.pdf`));
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const singlePage = async () => { const pdf = await PDFDocument.create(); pdf.addPage([420, 610]); return pdf.save(); };

describe("uploaded onboarding signing sources", () => {
  it("requires a configured source and the exact version that was reviewed", () => {
    expect(() => requireSigningAsset(null)).toThrow("not been configured");
    expect(() => assertSigningAsset(undefined, "current")).toThrow("changed");
    expect(() => assertSigningAsset("old", "current")).toThrow("changed");
    expect(() => assertSigningAsset("current", "current")).not.toThrow();
  });
  it("has no bundled template fallback in any PDF generator", async () => {
    await expect(generateSignedIcaPdf({} as never, new Date())).rejects.toThrow("Onboarding Steps");
    await expect(generateSignedW9Pdf({} as never, new Date())).rejects.toThrow("Onboarding Steps");
    await expect(generateDirectDepositPdf({} as never, new Date())).rejects.toThrow("Onboarding Steps");
  });
  it("uses mapped ICA signing only for a compatible uploaded field layout", async () => {
    const bytes = await fixture("ica");
    expect(await inspectSigningPdf(bytes, "ica")).toBe("ica_fields");
    const pdf = await PDFDocument.load(bytes);
    expect(signatureFieldRects(pdf, ["todays-date", "signature"]).map(rect => rect.pageIndex)).toEqual([11, 13]);
    pdf.removePage(0);
    expect(await inspectSigningPdf(await pdf.save(), "ica")).toBe("signature_record");
    expect(await inspectSigningPdf(await singlePage(), "ica")).toBe("signature_record");
  });
  it("checks W-9 field compatibility during upload", async () => {
    expect(await inspectSigningPdf(await fixture("w9"), "w9")).toBe("w9_fields");
    await expect(inspectSigningPdf(await singlePage(), "w9")).rejects.toThrow("fillable");
  });
  it("fills the uploaded W-9 and preserves its extra source pages", async () => {
    const source = await PDFDocument.load(await fixture("w9"));
    source.addPage([420, 610]).drawText("UPLOADED SOURCE ADDENDUM - TEST ONLY", { x: 30, y: 550, size: 12 });
    const bytes = await source.save();
    const output = await generateSignedW9Pdf({ legalName: "Sample Agent", taxClassification: "Individual/sole proprietor", taxClass: "individual", addressLine1: "123 Test St", city: "Test", state: "UT", zip: "84001", tinType: "ssn", tin: "000000000", signatureName: "Sample Agent", signatureImageBase64: "", certificationAccepted: true }, new Date("2026-11-03T12:00:00Z"), undefined, undefined, { bytes, assetId: "uploaded-w9-test", sha256: hash(bytes) });
    const pdf = await PDFDocument.load(output);
    expect(pdf.getPageCount()).toBe(source.getPageCount() + 1);
    expect(pdf.getPage(source.getPageCount() - 1).getSize()).toEqual({ width: 420, height: 610 });
    expect(pdf.catalog.has(PDFName.of("AcroForm"))).toBe(false);
    for (const page of pdf.getPages()) {
      for (const ref of page.node.Annots()?.asArray() ?? []) {
        const annotation = pdf.context.lookup(ref);
        expect(annotation).toBeInstanceOf(PDFDict);
        expect((annotation as PDFDict).get(PDFName.of("Subtype"))).not.toBe(PDFName.of("Widget"));
      }
    }
    if (process.env.PNCL_SIGNING_QA_DIR) await writeFile(`${process.env.PNCL_SIGNING_QA_DIR}/w9-sample.pdf`, output);
  });
  it("preserves uploaded direct deposit pages and appends entered details", async () => {
    const bytes = await singlePage();
    const output = await generateDirectDepositPdf({ legalName: "Sample Agent", addressLine1: "123 Test St", city: "Test", state: "UT", zip: "84001", accountType: "checking", accountNumber: "123456789", bankName: "Example Bank", routingNumber: "021000021", signatureName: "Sample Agent", authorizationAccepted: true }, new Date("2026-11-03T12:00:00Z"), { bytes, assetId: "uploaded-dd", sha256: hash(bytes) });
    const pdf = await PDFDocument.load(output);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 420, height: 610 });
    expect(pdf.catalog.has(PDFName.of("Names"))).toBe(true);
    if (process.env.PNCL_SIGNING_QA_DIR) await writeFile(`${process.env.PNCL_SIGNING_QA_DIR}/direct-deposit-sample.pdf`, output);
  });
});

function sourceClient() {
  const bytes = new TextEncoder().encode("source bytes");
  const source = { id: "ica-id", designation: "loa", kind: "ica", path: "loa/ica/source.pdf", sha256: hash(bytes), signing_mode: "signature_record" };
  const tables: Record<string, Record<string, unknown>[]> = {
    onboarding_flow_content: [{ designation: "loa", ica_asset_id: "ica-id" }, { designation: "ibo" }],
    onboarding_content_assets: [source],
    portal_todos: [{ slug: "ica_setup", published: true, show_loa: true, show_ibo: true }],
    portal_agent_designations: [{ user_id: "agent", designation: "loa" }],
    onboarding_flow_rules: [],
  };
  const download = vi.fn(async () => ({ data: { arrayBuffer: async () => bytes.buffer }, error: null }));
  const client = { from(table: string) {
    let rows = tables[table] ?? [];
    const query = { select: () => query, eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; }, in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query; }, single: async () => ({ data: rows[0] ?? null, error: null }), maybeSingle: async () => ({ data: rows[0] ?? null, error: null }), then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }) }; return query;
  }, storage: { from: () => ({ download, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.invalid/${path}` } }) }) } };
  return { client: client as never, source, tables, download };
}
describe("signing source resolution", () => {
  it("resolves each flow independently, with no cross-flow or bundled fallback", async () => {
    const s = sourceClient();
    expect((await loadOnboardingContent(s.client, "loa")).ica?.id).toBe("ica-id");
    expect((await loadOnboardingContent(s.client, "ibo")).ica).toBeNull();
  });
  it("blocks hidden or unpublished signing steps", async () => {
    const s = sourceClient(); s.tables.portal_todos[0].published = false;
    expect((await loadOnboardingContent(s.client, "loa")).ica).toBeNull();
    s.tables.portal_todos[0].published = true; s.tables.portal_todos[0].show_loa = false;
    expect((await loadOnboardingContent(s.client, "loa")).ica).toBeNull();
  });
  it("rejects missing or stale source IDs before downloading a document", async () => {
    const s = sourceClient();
    await expect(loadPortalSigningSource(s.client, "agent", "ica", null)).rejects.toThrow("changed");
    await expect(loadPortalSigningSource(s.client, "agent", "ica", "old-id")).rejects.toThrow("changed");
    expect(s.download).not.toHaveBeenCalled();
  });
  it("rejects a source whose bytes changed or whose flow is wrong", async () => {
    const s = sourceClient();
    await expect(downloadIcaAsset(s.client, { ...s.source, sha256: "invalid" } as never)).rejects.toThrow("verification");
    s.source.designation = "ibo";
    await expect(loadOnboardingContent(s.client, "loa")).rejects.toThrow("does not match");
  });
});
