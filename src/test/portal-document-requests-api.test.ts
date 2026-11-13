import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { PDFDocument } from "pdf-lib";
const state = vi.hoisted(() => ({ handler: null as unknown as (req: Request) => Promise<Response>, auth: vi.fn(), single: vi.fn(), eq: vi.fn(), not: vi.fn(), upload: vi.fn(), download: vi.fn(), update: vi.fn(), is: vi.fn(), remove: vi.fn(), url: vi.fn() }));
vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({ serve: (handler: typeof state.handler) => { state.handler = handler; } }));
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/adminAuth.ts", () => ({ requirePortalUser: state.auth, AdminAuthError: class extends Error { status = 401; code = "unauthorized"; } }));
vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({ getEmailDomain: () => "thepncl.com" }));
import "../../supabase/functions/portal-document-requests/index";
import { sha256 } from "../../supabase/functions/_shared/documentSigningPdf";
const adopted = { signatureAdoption: { method: "typed", accepted: true, version: "2026-11-13", name: "Alex Agent" }, signatureImageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==" };
const id = "b0000000-0000-0000-0000-000000000001";
const userId = "a0000000-0000-0000-0000-000000000002";
const query = { select: () => query, eq: state.eq, not: state.not, is: state.is, maybeSingle: state.single, update: state.update };
const client = { from: () => query, storage: { from: () => ({ upload: state.upload, download: state.download, remove: state.remove, createSignedUrl: state.url }) } };
const request = (body: unknown) => new Request("https://example.invalid", { method: "POST", body: JSON.stringify(body) });
let hash: string;
let row: Record<string, unknown>;
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("crypto", webcrypto);
  state.auth.mockResolvedValue({ user: { id: userId }, adminClient: client });
  state.eq.mockReturnValue(query); state.not.mockReturnValue(query); state.update.mockReturnValue(query); state.is.mockReturnValue(query);
  const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save(); hash = await sha256(bytes);
  row = { id, user_id: userId, signed_at: null, campaign: { title: "Test addendum", pdf_path: "edition.pdf", pdf_sha256: hash } };
  state.single.mockResolvedValue({ data: row, error: null });
  state.download.mockResolvedValue({ data: { arrayBuffer: async () => bytes.buffer }, error: null });
  state.upload.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());
describe("portal document endpoint", () => {
  it("scopes both signed downloads and signatures to the authenticated agent", async () => {
    state.single.mockResolvedValue({ data: null, error: null });
    expect((await state.handler(request({ action: "url", id }))).status).toBe(404);
    expect(state.eq).toHaveBeenCalledWith("user_id", userId);
    expect(state.not).toHaveBeenCalledWith("released_at", "is", null);
    expect(state.url).not.toHaveBeenCalled();
    expect((await state.handler(request({ action: "sign", id }))).status).toBe(404);
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("requires consent and the exact source version before signing", async () => {
    expect((await state.handler(request({ ...adopted, action: "sign", id, signatureName: "Alex Agent", accepted: false, documentHash: hash }))).status).toBe(400);
    expect((await state.handler(request({ ...adopted, action: "sign", id, signatureName: "Alex Agent", accepted: true, documentHash: "stale" }))).status).toBe(400);
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("saves a signed PDF and atomically claims only an unsigned request", async () => {
    expect((await state.handler(request({ ...adopted, action: "sign", id, signatureName: "Alex Agent", accepted: true, documentHash: hash }))).status).toBe(200);
    expect(state.upload).toHaveBeenCalledWith(expect.stringMatching(/^signatures\//), expect.any(Uint8Array), { contentType: "application/pdf", upsert: false });
    expect(state.is).toHaveBeenCalledWith("signed_at", null);
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ signature_name: "Alex Agent", consent_text: expect.stringContaining("electronic signature") }));
  });
  it("rejects absent adoption, changed names and invalid signature images before storing anything", async () => {
    for (const patch of [{ signatureAdoption: null }, { signatureAdoption: { ...adopted.signatureAdoption, accepted: false } }, { signatureAdoption: { ...adopted.signatureAdoption, name: "Different Agent" } }, { signatureImageBase64: "not-an-image" }]) {
      expect((await state.handler(request({ ...adopted, action: "sign", id, signatureName: "Alex Agent", accepted: true, documentHash: hash, ...patch }))).status).toBe(400);
    }
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("does not overwrite an existing signature on retry", async () => {
    state.single.mockResolvedValue({ data: { ...row, signed_at: "2026-11-03T18:00:00Z" }, error: null });
    expect((await state.handler(request({ action: "sign", id }))).status).toBe(200);
    expect(state.upload).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
  });
});
