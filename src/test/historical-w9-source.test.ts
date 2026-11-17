import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ decrypt: vi.fn(), generate: vi.fn(), download: vi.fn() }));
vi.mock("../../supabase/functions/_shared/security.ts", () => ({ decryptTemporaryPassword: state.decrypt }));
vi.mock("../../supabase/functions/_shared/onboardingContent.ts", () => ({ downloadIcaAsset: state.download }));
vi.mock("../../supabase/functions/_shared/portalDirectDeposit.ts", () => ({ DIRECT_DEPOSIT_PDF_BUCKET: "portal-profile-documents" }));
vi.mock("../../supabase/functions/_shared/portalW9Pdf.ts", () => ({
  generatePortalW9PdfFromRecord: state.generate,
  resolveW9PdfPath: (record: { pdf_path?: string; user_id: string }) => record.pdf_path || `${record.user_id}/w9.pdf`,
}));
import { createW9DownloadUrl, ensureW9Pdf } from "../../supabase/functions/_shared/portalW9Documents";
beforeEach(() => vi.clearAllMocks());

describe("historical W-9 source preservation", () => {
  it("keeps original signed files downloadable without a source asset", async () => {
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://example.invalid/original" }, error: null }));
    const client = { storage: { from: () => ({ createSignedUrl }) } };
    expect(await createW9DownloadUrl(client as never, { user_id: "agent", pdf_path: "agent/original.pdf" } as never)).toBe("https://example.invalid/original");
    expect(createSignedUrl).toHaveBeenCalledWith("agent/original.pdf", 3600);
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("requires restoring the original file when a historical record has no source", async () => {
    await expect(ensureW9Pdf({} as never, { user_id: "agent" } as never)).rejects.toThrow("Restore its original signed PDF");
    expect(state.decrypt).not.toHaveBeenCalled();
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("rejects a replacement PDF instead of changing a historical signed form", async () => {
    const query = { select: () => query, eq: () => query, single: async () => ({ data: { sha256: "different-source" }, error: null }) };
    await expect(ensureW9Pdf({ from: () => query } as never, { user_id: "agent", template_asset_id: "original", template_sha256: "original-hash" } as never)).rejects.toThrow("cannot be regenerated from a different template");
    expect(state.download).not.toHaveBeenCalled();
    expect(state.decrypt).not.toHaveBeenCalled();
  });
});
