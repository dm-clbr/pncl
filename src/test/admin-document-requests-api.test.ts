import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { EMPTY_DOCUMENT_FILTERS } from "../../supabase/functions/_shared/documentRequestRules";
const state = vi.hoisted(() => ({ handler: null as unknown as (req: Request) => Promise<Response>, auth: vi.fn(), upload: vi.fn(), rpc: vi.fn(), single: vi.fn(), remove: vi.fn() }));
vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({ serve: (handler: typeof state.handler) => { state.handler = handler; } }));
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/adminAuth.ts", () => ({ requireAdmin: state.auth, AdminAuthError: class extends Error { status = 403; code = "forbidden"; } }));
vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({ getEmailDomain: () => "thepncl.com" }));
vi.mock("../../supabase/functions/_shared/resend.ts", () => ({ getFromAddress: () => "PNCL <qa@example.invalid>", getResendApiKey: () => "test-key" }));
import "../../supabase/functions/admin-document-requests/index";
import { AdminAuthError } from "../../supabase/functions/_shared/adminAuth";
const id = "b0000000-0000-0000-0000-000000000001";
const admin = "a0000000-0000-0000-0000-000000000001";
const query = { select: () => query, eq: () => query, maybeSingle: state.single };
const client = { from: () => query, rpc: state.rpc, storage: { from: () => ({ upload: state.upload, remove: state.remove }) } };
const request = (body: unknown) => new Request("https://example.invalid", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("crypto", webcrypto);
  state.auth.mockResolvedValue({ user: { id: admin }, adminClient: client });
  state.single.mockResolvedValue({ data: null, error: null });
  state.rpc.mockResolvedValue({ data: id, error: null });
  state.upload.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());
async function payload() {
  const pdf = await PDFDocument.create(); pdf.addPage();
  return { action: "publish", id, title: "Test addendum", description: "Test instructions", filters: EMPTY_DOCUMENT_FILTERS,
    recipientIds: ["a0000000-0000-0000-0000-000000000002"], onboardingEnabled: true, onboardingAudience: "ibo", deliveryMode: "both", rolloutOrder: "current_first",
    pdfBase64: Buffer.from(await pdf.save()).toString("base64") };
}
describe("admin document endpoint", () => {
  it("rejects unauthorized calls before accessing recipients or files", async () => {
    state.auth.mockRejectedValue(new AdminAuthError("Full admin access required"));
    expect((await state.handler(request({ action: "preview", filters: EMPTY_DOCUMENT_FILTERS }))).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
  });
  it("persists only the reviewed recipient IDs and a hash of the immutable PDF", async () => {
    const input = await payload();
    expect((await state.handler(request(input))).status).toBe(200);
    expect(state.upload).toHaveBeenCalledWith(expect.stringMatching(/^editions\//), expect.any(Uint8Array), { contentType: "application/pdf", upsert: false });
    expect(state.rpc).toHaveBeenCalledWith("publish_document_request", expect.objectContaining({ p_recipients: input.recipientIds, p_onboarding: true, p_delivery: "both", p_order: "current_first", p_audience: "ibo", p_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });
  it("returns an existing publication on retry without reuploading or sending", async () => {
    state.single.mockResolvedValue({ data: { id, created_by: admin }, error: null });
    expect((await state.handler(request({ action: "publish", id }))).status).toBe(200);
    expect(state.upload).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("does not publish bad PDFs or when storage fails", async () => {
    const input = await payload();
    expect((await state.handler(request({ ...input, pdfBase64: btoa("not a pdf") }))).status).toBe(400);
    state.upload.mockResolvedValueOnce({ error: new Error("Storage unavailable") });
    expect((await state.handler(request(input))).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("does not delete a potentially committed source on an ambiguous database failure", async () => {
    state.rpc.mockResolvedValue({ error: new Error("Network interrupted") });
    expect((await state.handler(request(await payload()))).status).toBe(400);
    expect(state.remove).not.toHaveBeenCalled();
  });
  it("rejects invalid delivery or rollout settings before uploading", async () => {
    const input = await payload();
    expect((await state.handler(request({ ...input, deliveryMode: "typo" }))).status).toBe(400);
    expect((await state.handler(request({ ...input, rolloutOrder: "typo" }))).status).toBe(400);
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("releases a stage through the admin-only transaction", async () => {
    expect((await state.handler(request({ action: "release_current", id }))).status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("release_document_current_agents", { p_id: id, p_admin: admin });
  });

});
