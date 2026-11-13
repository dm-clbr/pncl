import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { PDFDocument } from "pdf-lib";
const state = vi.hoisted(() => ({ handler: null as unknown as (req: Request) => Promise<Response>, upload: vi.fn(), upsert: vi.fn(), encrypt: vi.fn(), metadata: vi.fn() }));
vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({ serve: (handler: typeof state.handler) => { state.handler = handler; } }));
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/adminAuth.ts", () => ({ requirePortalUser: async () => ({ user: { id: "sample-agent", user_metadata: {} }, adminClient: client }), AdminAuthError: class extends Error {} }));
vi.mock("../../supabase/functions/_shared/security.ts", () => ({ encryptTemporaryPassword: state.encrypt }));
vi.mock("../../supabase/functions/_shared/logger.ts", () => ({ logOnboarding: vi.fn() }));
import "../../supabase/functions/submit-portal-direct-deposit/index";
const client = {
  storage: { from: () => ({ upload: state.upload }) },
  from: () => ({ upsert: state.upsert }),
  auth: { admin: { updateUserById: state.metadata } },
};
const body = { legalName: "Sample Agent", addressLine1: "123 Test St", city: "Test", state: "UT", zip: "84001", accountType: "checking", bankName: "Test Bank", accountNumber: "123456789", routingNumber: "021000021", signatureName: "Sample Agent", authorizationAccepted: true };
const request = (payload: unknown) => new Request("https://example.invalid", { method: "POST", body: JSON.stringify(payload) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("crypto", webcrypto);
  state.upload.mockResolvedValue({ error: null });
  state.encrypt.mockResolvedValue("encrypted-test-value");
  state.metadata.mockResolvedValue({ error: null });
  state.upsert.mockImplementation(row => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) }));
});
describe("coded direct deposit submission", () => {
  it("generates a PDF without a template and stores encrypted bank details", async () => {
    const response = await state.handler(request(body));
    expect(response.status).toBe(200);
    expect(state.encrypt).toHaveBeenCalledWith(body.accountNumber);
    expect(state.encrypt).toHaveBeenCalledWith(body.routingNumber);
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "sample-agent", account_number_encrypted: "encrypted-test-value", routing_number_encrypted: "encrypted-test-value", template_asset_id: null, template_sha256: null }), { onConflict: "user_id" });
    const [path, bytes, options] = state.upload.mock.calls[0];
    expect(path).toMatch(/^sample-agent\/direct-deposit\/[a-f0-9-]+\.pdf$/);
    expect(options).toEqual({ upsert: false, contentType: "application/pdf" });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    expect(state.metadata).toHaveBeenCalledWith("sample-agent", expect.objectContaining({ user_metadata: expect.objectContaining({ completed_portal_todos: { direct_deposit_setup: true } }) }));
  });
  it("requires the coded form's authorization before saving banking details", async () => {
    const response = await state.handler(request({ ...body, authorizationAccepted: false }));
    expect(response.ok).toBe(false);
    expect(state.encrypt).not.toHaveBeenCalled();
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.upsert).not.toHaveBeenCalled();
  });
});
