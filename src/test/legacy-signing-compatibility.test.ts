import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({ getEmailDomain: () => "thepncl.com" }));
import { generateSignedIcaPdf, validateSubmitOnboardingContractPayload } from "../../supabase/functions/_shared/legacySigning/onboardingContract";
import { generateSignedW9Pdf } from "../../supabase/functions/_shared/legacySigning/portalW9Pdf";
import { validateSubmitPortalW9Payload } from "../../supabase/functions/_shared/portalW9";
import { loadOnboardingContent } from "../../supabase/functions/_shared/legacySigning/onboardingContent";
afterEach(() => vi.unstubAllGlobals());
const signedAt = new Date("2026-11-03T12:00:00Z");
const signature = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
describe("existing signing during document preparation", () => {
  it("still generates the bundled ICA with the actual deployed static asset path", async () => {
    vi.stubGlobal("Deno", { readFile: (path: URL) => readFile(path).then(bytes => Uint8Array.from(bytes)), env: { get: () => undefined } });
    const payload = validateSubmitOnboardingContractPayload({ legalName: "Sample Agent", personalEmail: "sample@example.invalid", signatureName: "Sample Agent", signatureImageBase64: signature, agreementAccepted: true, counselAcknowledged: true, debitCheckInitials: { a: "SA", b: "SA", c: "SA", d: "SA", e: "SA" } });
    const bytes = await generateSignedIcaPdf(payload, signedAt, undefined, pathToFileURL(resolve("supabase/functions/submit-portal-ica/legacy.ts")).href);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(15);
  });
  it("uses the unchanged W-9 template in both the legacy viewer and generator", async () => {
    vi.stubGlobal("Deno", { readFile: (path: URL) => readFile(path).then(bytes => Uint8Array.from(bytes)) });
    expect(await readFile("public/documents/pncl-w9-legacy.pdf")).toEqual(await readFile("supabase/functions/submit-portal-w9/assets/pncl-w9-standard.pdf"));
    const payload = validateSubmitPortalW9Payload({ legalName: "Sample Agent", taxClass: "individual", addressLine1: "100 Test Way", city: "Test City", state: "UT", zip: "84001", tinType: "ssn", tin: "123456789", signatureName: "Sample Agent", certificationAccepted: true });
    const bytes = await generateSignedW9Pdf(payload, signedAt, undefined, pathToFileURL(resolve("supabase/functions/submit-portal-w9/legacy.ts")).href);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(7);
  });
  it("ignores new ICA selections for existing agents until activation", async () => {
    const client = { from: (table: string) => {
      const data = table === "onboarding_flow_content" ? { ica_asset_id: "new-upload", welcome_video_asset_id: null, surelc_video_asset_id: null } : { enabled: false, revision: 0, legacy_ica_sources: { loa: null, ibo: null }, legacy_steps: [] };
      const q = { select: () => q, eq: () => q, single: async () => ({ data, error: null }), maybeSingle: async () => ({ data: null, error: null }) }; return q;
    }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://example.invalid" } }) }) } };
    expect((await loadOnboardingContent(client as never, "loa")).ica).toBeNull();
  });
});
