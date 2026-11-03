import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DOCUMENT_FILTERS } from "../../supabase/functions/_shared/documentRequestRules";
const state = vi.hoisted(() => ({ handler: null as unknown as (req: Request) => Promise<Response>, auth: vi.fn(), rpc: vi.fn(), single: vi.fn(), storage: vi.fn(), from: vi.fn() }));
vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({ serve: (handler: typeof state.handler) => { state.handler = handler; } }));
vi.mock("../../supabase/functions/_shared/adminAuth.ts", () => ({ requireAdmin: state.auth, AdminAuthError: class extends Error { status = 403; code = "forbidden"; } }));
vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({ getEmailDomain: () => "thepncl.com" }));
vi.mock("../../supabase/functions/_shared/resend.ts", () => ({ getFromAddress: () => "PNCL <qa@example.invalid>", getResendApiKey: () => "test-key" }));
import "../../supabase/functions/admin-document-requests/index";
import { AdminAuthError } from "../../supabase/functions/_shared/adminAuth";
const id = "b0000000-0000-0000-0000-000000000001";
const admin = "a0000000-0000-0000-0000-000000000001";
const query = { select: () => query, eq: () => query, single: state.single };
const client = { from: state.from, rpc: state.rpc, storage: { from: state.storage } };
const request = (body: unknown) => new Request("https://example.invalid", { method: "POST", body: JSON.stringify(body) });
const input = { action: "publish_linked", id, stepId: id, flow: "loa", assetId: id, expectedAssetId: null, filters: { ...EMPTY_DOCUMENT_FILTERS, designation: "loa" }, recipientIds: [admin], deliveryMode: "both", rolloutOrder: "current_first" };
beforeEach(() => {
  vi.resetAllMocks();
  state.auth.mockResolvedValue({ user: { id: admin }, adminClient: client });
  state.from.mockReturnValue(query);
  state.single.mockResolvedValueOnce({ data: { id, slug: "ica_setup", title: "ICA", description: "Sign", content_type: "ica", flow_content: {}, published: true, show_loa: true }, error: null })
    .mockResolvedValue({ data: { id, designation: "loa", kind: "ica", path: "ica.pdf", filename: "ica.pdf" }, error: null });
  state.storage.mockReturnValue({ getPublicUrl: () => ({ data: { publicUrl: "https://example.invalid/ica.pdf" } }) });
  state.rpc.mockResolvedValue({ data: id, error: null });
});
describe("linked document admin endpoint", () => {
  it("rejects unauthorized calls before reading documents or recipients", async () => {
    state.auth.mockRejectedValue(new AdminAuthError("Full admin access required"));
    expect((await state.handler(request(input))).status).toBe(403);
    expect(state.from).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("publishes a source reference and exact reviewed recipients without reuploading", async () => {
    expect((await state.handler(request(input))).status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("publish_onboarding_document_rollout", expect.objectContaining({ p_step: id, p_asset: id, p_expected_asset: null, p_flow: "loa", p_recipients: [admin], p_order: "current_first", p_delivery: "both" }));
    expect(state.storage).toHaveBeenCalledWith("onboarding-content");
  });
  it("rejects files from another flow before publication", async () => {
    state.single.mockReset().mockResolvedValueOnce({ data: { id, content_type: "ica", flow_content: {} }, error: null }).mockResolvedValue({ data: { id, designation: "ibo", kind: "ica" }, error: null });
    expect((await state.handler(request(input))).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("cannot broaden the PDF audience to another flow", async () => {
    expect((await state.handler(request({ ...input, filters: EMPTY_DOCUMENT_FILTERS }))).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects detached uploads so every new rollout starts at an onboarding step", async () => {
    const response = await state.handler(request({ action: "publish", id, pdfBase64: "unrelated" }));
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ message: expect.stringContaining("onboarding step") });
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.storage).not.toHaveBeenCalled();
  });
  it("surfaces stale-source errors without deleting the shared source", async () => {
    state.rpc.mockResolvedValue({ error: new Error("The step PDF changed. Reload and review the rollout again.") });
    const response = await state.handler(request(input));
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ message: expect.stringContaining("step PDF changed") });
  });
  it("releases a held stage through the admin transaction", async () => {
    expect((await state.handler(request({ action: "release_current", id }))).status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("release_document_current_agents", { p_id: id, p_admin: admin });
  });
});
