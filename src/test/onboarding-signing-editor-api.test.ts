import { beforeEach, describe, it, expect, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
const state = vi.hoisted(() => ({ handler: null as unknown as (req: Request) => Promise<Response>, upload: vi.fn(), insert: vi.fn(), rpc: vi.fn(), rows: [] as unknown[] }));
vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({ serve: (handler: typeof state.handler) => { state.handler = handler; } }));
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/adminAuth.ts", () => ({ requireAdmin: async () => ({ user: { id: "admin" }, adminClient: client }), AdminAuthError: class extends Error {} }));
vi.mock("../../supabase/functions/_shared/onboardingContent.ts", () => ({ loadOnboardingContent: vi.fn() }));
vi.mock("../../supabase/functions/_shared/usZipCounty.ts", () => ({ lookupCountyFromZip: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalIca.ts", () => ({ listIcaSignedUserIds: vi.fn() }));
import "../../supabase/functions/admin-onboarding-editor/index";
const client = {
  storage: { getBucket: async () => ({ data: { file_size_limit: 50 * 1024 * 1024 }, error: null }), from: () => ({ upload: state.upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.invalid/${path}` } }) }) },
  from: () => { const q = { insert: state.insert, select: () => q, order: () => q, then: (resolve: (value: unknown) => void) => resolve({ data: state.rows, error: null }) }; return q; }, rpc: state.rpc,
};
beforeEach(() => { vi.clearAllMocks(); state.rows = []; vi.stubGlobal("Deno", { env: { get: () => undefined } }); vi.stubGlobal("crypto", webcrypto); state.upload.mockResolvedValue({ error: null }); state.insert.mockResolvedValue({ error: null }); state.rpc.mockResolvedValue({ data: "saved", error: null }); });
const upload = (bytes: Uint8Array, kind: string) => {
  const file = new File([bytes], "uploaded.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
  const fields = new Map<string, unknown>([["file", file], ["kind", kind], ["designation", "loa"]]);
  return state.handler({ method: "POST", headers: new Headers({ "content-type": "multipart/form-data" }), formData: async () => ({ get: (key: string) => fields.get(key) }) } as Request);
};
describe("Onboarding Steps signing uploads", () => {
  it("can save an existing signing step again without a legacy auto-completion rule", async () => {
    state.rows = [{ id: "custom-step", slug: "additional_agreement", content_type: "signing_document", completion_type: "auto", auto_key: null }];
    const response = await state.handler(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveStep", row: { id: "custom-step", contentType: "signing_document", title: "Additional agreement", description: "Review and sign", completionType: "auto", autoKey: null, published: false, showLoa: true, showIbo: false, flowContent: {} } }) }));
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("save_onboarding_editor_step", { payload: expect.objectContaining({ contentType: "signing_document", completionType: "auto", autoKey: null }) });
  });
  it.each(["ica", "direct_deposit", "comp_agreement", "signing_document"])("registers an immutable %s source without publishing it before Save", async kind => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    const response = await upload(await pdf.save(), kind);
    expect(response.status).toBe(200);
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ kind, designation: "loa", signing_mode: "signature_record", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(state.upload).toHaveBeenCalledWith(expect.any(String), expect.any(Uint8Array), { contentType: "application/pdf", upsert: false });
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects incompatible W-9 uploads before writing any source file", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    const response = await upload(await pdf.save(), "w9");
    expect(response.status).toBe(400); expect((await response.json()).message).toContain("fillable");
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("accepts an uploaded fillable W-9 and records its signing mode", async () => {
    const response = await upload(Uint8Array.from(await readFile("public/documents/pncl-w9-standard.pdf")), "w9");
    expect(response.status).toBe(200);
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "w9", signing_mode: "w9_fields" }));
  });
  it("blocks publishing an enabled signing step without a document", async () => {
    state.rows = [{ id: "w9-step", slug: "w9_setup", content_type: "w9", completion_type: "auto" }];
    const response = await state.handler(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveStep", row: { id: "w9-step", contentType: "w9", title: "W-9", description: "Review", published: true, showLoa: true, showIbo: false, flowContent: {} } }) }));
    expect(response.status).toBe(400); expect((await response.json()).message).toContain("Add LOA content"); expect(state.rpc).not.toHaveBeenCalled();
  });
});
