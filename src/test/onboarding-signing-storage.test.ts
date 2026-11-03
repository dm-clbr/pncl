import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

const state = vi.hoisted(() => ({ handler: null as unknown as (req: Request) => Promise<Response>, upload: vi.fn() }));
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
vi.mock("../../supabase/functions/_shared/portalDirectDeposit.ts", () => ({ generateDirectDepositPdf: async () => new Uint8Array([1]), validateSubmitDirectDepositPayload: (body: unknown) => body, mapDirectDepositSummary: vi.fn(), DIRECT_DEPOSIT_PDF_BUCKET: "portal-profile-documents", DIRECT_DEPOSIT_TODO_SLUG: "direct_deposit_setup" }));
vi.mock("../../supabase/functions/_shared/contractingNotifications.ts", () => ({ notifyAdminsOfIcaSigned: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalRecoveryEmail.ts", () => ({ syncPortalRecoveryEmailForUser: vi.fn() }));
vi.mock("../../supabase/functions/_shared/security.ts", () => ({ encryptTemporaryPassword: async () => "encrypted-test-value" }));

vi.mock("../../supabase/functions/_shared/signingRollout.ts", () => ({ uploadedSigningEnabled: async () => true }));
vi.mock("../../supabase/functions/submit-portal-ica/legacy.ts", () => ({ legacyHandler: vi.fn() }));
vi.mock("../../supabase/functions/submit-portal-w9/legacy.ts", () => ({ legacyHandler: vi.fn() }));
vi.mock("../../supabase/functions/submit-portal-direct-deposit/legacy.ts", () => ({ legacyHandler: vi.fn() }));

const client = {
  storage: { from: () => ({ upload: state.upload }) },
  from: () => ({ upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "The configured signing source changed during signing" } }) }) }) }),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  vi.stubGlobal("crypto", webcrypto);
  state.upload.mockResolvedValue({ error: null });
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
