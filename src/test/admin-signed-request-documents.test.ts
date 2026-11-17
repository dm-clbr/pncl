import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";

function setup(rows: unknown[] = [], requestError: unknown = null) {
  const requestQuery = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: rows, error: requestError }),
  };
  const otherQuery = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [] }), maybeSingle: vi.fn().mockResolvedValue({ data: null }),
  };
  const client = {
    from: (table: string) => table === "portal_document_requests" ? requestQuery : otherQuery,
    storage: { from: () => ({ list: async () => ({ data: [] }) }) },
  };
  const documentUrl = vi.fn(async (_client, path, bucket) => `https://files.example/${bucket}/${path}`);
  const js = ts.transpileModule(readFileSync("supabase/functions/_shared/adminUserProfile.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/^import .*;\n/gm, "").replace(/^export /gm, "");
  const deps = { documentUrl, DOCUMENT_BUCKET: "portal-signing-documents", DIRECT_DEPOSIT_PDF_BUCKET: "profile-documents", PORTAL_PROFILE_DOCUMENTS_BUCKET: "profile-uploads" };
  const functions = new Function(...Object.keys(deps), `${js}\nreturn {loadSignedRequestDocuments, loadAdminUserDocumentsWithContract};`)(...Object.values(deps));
  return { client, requestQuery, documentUrl, ...functions };
}
const signed = { id: "signed-request", signed_at: "2026-11-16T17:33:40Z", signed_pdf_path: "signatures/agent/signed-request/ica-signed.pdf", campaign: { title: "LOA ICA" } };

describe("admin signed request documents", () => {
  it("includes released signed request PDFs in the profile, including an ICA after its native record was reset", async () => {
    const h = setup([signed, { ...signed, id: "addendum", signed_pdf_path: "signatures/agent/addendum/copy.pdf", campaign: { title: "Book of Business" } }]);
    const result = await h.loadAdminUserDocumentsWithContract(h.client, "agent", "onboarding", null, null);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ id: "document-request:signed-request", label: "LOA ICA", fileName: "ica-signed.pdf", signedAt: signed.signed_at, downloadUrl: `https://files.example/portal-signing-documents/${signed.signed_pdf_path}` });
    expect(h.requestQuery.eq).toHaveBeenCalledWith("user_id", "agent");
    for (const column of ["released_at", "signed_at", "signed_pdf_path"]) expect(h.requestQuery.not).toHaveBeenCalledWith(column, "is", null);
    expect(h.documentUrl).toHaveBeenCalledWith(h.client, signed.signed_pdf_path, "portal-signing-documents");
  });
  it("loads all pages of signed copies", async () => {
    const h = setup();
    h.requestQuery.range.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => ({ ...signed, id: `request-${i}` })) }).mockResolvedValueOnce({ data: [signed] });
    expect(await h.loadSignedRequestDocuments(h.client, "agent")).toHaveLength(101);
    expect(h.requestQuery.range).toHaveBeenNthCalledWith(2, 100, 199);
  });
  it("does not silently report missing signatures when their lookup fails", async () => {
    const h = setup([], new Error("Database unavailable"));
    await expect(h.loadSignedRequestDocuments(h.client, "agent")).rejects.toThrow("Unable to load signed document requests");
    expect(h.documentUrl).not.toHaveBeenCalled();
  });
});
