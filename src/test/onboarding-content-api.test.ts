import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { PDFDocument } from "pdf-lib";

const state = vi.hoisted(() => ({
  handler: null as unknown as (request: Request) => Promise<Response>,
  requireAdmin: vi.fn(), upload: vi.fn(), rpc: vi.fn(), load: vi.fn(),
}));
vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({ serve: (handler: typeof state.handler) => { state.handler = handler; } }));
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/adminAuth.ts", () => ({
  requireAdmin: state.requireAdmin,
  AdminAuthError: class extends Error { status = 403; code = "forbidden"; },
}));
vi.mock("../../supabase/functions/_shared/onboardingContent.ts", () => ({ loadOnboardingContent: state.load }));
import "../../supabase/functions/admin-onboarding-content/index";
import { AdminAuthError } from "../../supabase/functions/_shared/adminAuth";

const client = {
  storage: { from: () => ({ upload: state.upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.invalid/${path}` } }) }) },
  rpc: state.rpc,
};
function request(bytes: Uint8Array, kind = "ica", type = "application/pdf") {
  const file = new File([bytes], "test-file", { type });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
  const fields = new Map<string, unknown>([["file", file], ["designation", "ibo"], ["kind", kind]]);
  return { method: "POST", formData: async () => ({ get: (key: string) => fields.get(key) }) } as Request;
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.clearAllMocks();
  state.requireAdmin.mockResolvedValue({ user: { id: "admin-id" }, adminClient: client });
  state.upload.mockResolvedValue({ error: null });
  state.rpc.mockResolvedValue({ error: null });
  state.load.mockResolvedValue({ designation: "ibo", ica: { id: "saved" } });
});
afterEach(() => vi.unstubAllGlobals());

describe("admin content endpoint", () => {
  it("rejects non-admin callers before reading or storing their files", async () => {
    state.requireAdmin.mockRejectedValue(new AdminAuthError("Admin access required"));
    const response = await state.handler(request(new Uint8Array([1])));
    expect(response.status).toBe(403);
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("validates PDF contents and publishes an immutable, flow-specific source", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    const response = await state.handler(request(await pdf.save()));
    expect(response.status).toBe(200);
    expect(state.upload).toHaveBeenCalledWith(expect.stringMatching(/^ibo\/ica\/.+\.pdf$/), expect.any(Uint8Array), { contentType: "application/pdf", upsert: false });
    expect(state.rpc).toHaveBeenCalledWith("publish_onboarding_content", {
      asset: expect.objectContaining({ designation: "ibo", kind: "ica", sha256: expect.stringMatching(/^[a-f0-9]{64}$/), created_by: "admin-id" }), video_url: null,
    });
  });
  it("rejects a non-PDF disguised as a PDF and invalid video bytes", async () => {
    expect((await state.handler(request(new TextEncoder().encode("not a pdf")))).status).toBe(400);
    expect((await state.handler(request(new Uint8Array([1, 2, 3]), "welcome_video", "video/mp4"))).status).toBe(400);
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("does not publish if storage fails, and reports an unconfirmed publication", async () => {
    const video = new TextEncoder().encode("0000ftyp00000000");
    state.upload.mockResolvedValueOnce({ error: { message: "Storage unavailable" } });
    expect((await state.handler(request(video, "surelc_video", "video/mp4"))).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
    state.rpc.mockResolvedValueOnce({ error: { message: "Database unavailable" } });
    const response = await state.handler(request(video, "surelc_video", "video/mp4"));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain("publication could not be confirmed");
  });
});
