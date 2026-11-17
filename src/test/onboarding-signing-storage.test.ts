import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));

const state = vi.hoisted(() => ({ handler: null as unknown as (req: Request) => Promise<Response>, upload: vi.fn(), save: vi.fn(), metadata: vi.fn(), recovery: vi.fn() }));
vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({ serve: (handler: typeof state.handler) => { state.handler = handler; } }));
vi.mock("../../supabase/functions/_shared/adminAuth.ts", () => ({ requirePortalUser: async () => ({ user: { id: "sample-agent" }, adminClient: client }), AdminAuthError: class extends Error {} }));
vi.mock("../../supabase/functions/_shared/onboardingContent.ts", () => ({
  loadOnboardingContent: async () => ({ ica: { id: "source" } }),
  downloadIcaAsset: async () => ({ bytes: new Uint8Array(), assetId: "source", sha256: "hash" }),
  loadPortalSigningSource: async () => ({ asset: { id: "source" }, designation: "loa", bytes: new Uint8Array(), sha256: "hash" }),
}));
vi.mock("../../supabase/functions/_shared/portalAgentDesignations.ts", () => ({ loadAgentDesignations: async () => new Map([["sample-agent", "loa"]]) }));
vi.mock("../../supabase/functions/_shared/onboardingSigningPdf.ts", () => ({ inspectSigningPdf: async () => "signature_record" }));
vi.mock("../../supabase/functions/_shared/onboardingContract.ts", () => ({ generateSignedIcaPdf: async () => new Uint8Array([1]), validateSubmitOnboardingContractPayload: (body: unknown) => body, ICA_VERSION: "test" }));
vi.mock("../../supabase/functions/_shared/portalW9Pdf.ts", () => ({ generateSignedW9Pdf: async () => new Uint8Array([1]) }));
vi.mock("../../supabase/functions/_shared/portalW9.ts", () => ({ validateSubmitPortalW9Payload: (body: unknown) => body, mapPortalW9Summary: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalW9Documents.ts", () => ({ PORTAL_PROFILE_DOCUMENTS_BUCKET: "portal-profile-documents" }));
vi.mock("../../supabase/functions/_shared/directDepositReceipt.ts", () => ({ generateDirectDepositPdf: async () => new Uint8Array([1]), validateSubmitDirectDepositPayload: (body: unknown) => body, mapDirectDepositSummary: vi.fn(), DIRECT_DEPOSIT_PDF_BUCKET: "portal-profile-documents", DIRECT_DEPOSIT_TODO_SLUG: "direct_deposit_setup" }));
vi.mock("../../supabase/functions/_shared/contractingNotifications.ts", () => ({ notifyAdminsOfIcaSigned: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalRecoveryEmail.ts", () => ({ syncPortalRecoveryEmailForUser: state.recovery }));
vi.mock("../../supabase/functions/_shared/security.ts", () => ({ encryptTemporaryPassword: async () => "encrypted-test-value" }));

vi.mock("../../supabase/functions/_shared/signingRollout.ts", () => ({ requireUploadedSigning: async () => undefined }));

const client = {
  auth: { admin: { updateUserById: state.metadata } },
  storage: { from: () => ({ upload: state.upload }) },
  from: () => ({ upsert: () => ({ select: () => ({ single: state.save }) }) }),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  vi.stubGlobal("crypto", webcrypto);
  state.upload.mockResolvedValue({ error: null });
  state.save.mockResolvedValue({ data: null, error: { message: "The configured signing source changed during signing" } });
  state.metadata.mockResolvedValue({ error: null });
  state.recovery.mockResolvedValue({ syncStatus: "synced" });
});

describe("signed document storage during a source replacement", () => {
  it.each(["submit-portal-ica", "submit-portal-w9", "submit-portal-direct-deposit"])("%s leaves previous signed files untouched when the database rejects a stale source", async endpoint => {
    await import(`../../supabase/functions/${endpoint}/index.ts`);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await state.handler(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ templateAssetId: "source" }) }));
      expect(response.ok).toBe(false);
      expect((await response.json()).message).toContain("source changed");
    }
    const [first, second] = state.upload.mock.calls;
    expect(first[0]).toMatch(/^sample-agent\/.+\/[a-f0-9-]+\.pdf$/);
    expect(second[0]).not.toBe(first[0]);
    expect(first[2]).toEqual({ upsert: false, contentType: "application/pdf" });
    expect(second[2]).toEqual(first[2]);
  });
});


describe("committed ICA signatures", () => {
  it.each(["recovery throws", "recovery reports error", "metadata fails"])("returns signing success when %s", async failure => {
    vi.resetModules();
    await import("../../supabase/functions/submit-portal-ica/index.ts");
    state.save.mockResolvedValue({ data: { user_id: "sample-agent", legal_name: "Sample Agent", pdf_path: "sample-agent/ica/signed.pdf", signed_at: "2026-11-17T10:00:00Z" }, error: null });
    if (failure === "recovery throws") state.recovery.mockRejectedValue(new Error("Profile unavailable"));
    if (failure === "recovery reports error") state.recovery.mockResolvedValue({ syncStatus: "error" });
    if (failure === "metadata fails") state.metadata.mockResolvedValue({ error: { message: "Auth unavailable" } });
    const response = await state.handler(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ templateAssetId: "source", personalEmail: "sample@example.com" }) }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.ica.pdfPath).toBe("sample-agent/ica/signed.pdf");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("agreement is saved");
    expect(state.recovery).toHaveBeenCalledOnce();
    expect(state.save).toHaveBeenCalledOnce();
  });
});
