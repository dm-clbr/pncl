import { describe, expect, it, vi } from "vitest";
import { loadSignedIcaDocumentRequests } from "../../supabase/functions/_shared/icaDocumentRequests";
import { createIcaDownloadUrl, listIcaSignedUserIds, resolveUserIcaStatus } from "../../supabase/functions/_shared/portalIca";
import { computeAutoCompletionSets } from "../../supabase/functions/_shared/portalTodos";
import { isTodoCompleteForUser } from "../../supabase/functions/_shared/todoCompletion";
import { derivePortalPhase, isStageLocked, type PortalTodo } from "@/lib/portal-todos";

vi.mock("../../supabase/functions/_shared/onboardingContract.ts", () => ({ createOnboardingContractSignedUrl: async () => "onboarding-url" }));
vi.mock("../../supabase/functions/_shared/portalW9Documents.ts", () => ({ createPortalW9SignedUrl: async () => "portal-url" }));
vi.mock("../../supabase/functions/_shared/usZipCounty.ts", () => ({ lookupCountyFromZip: () => "Test County" }));
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({ getEmailDomain: () => "thepncl.com" }));

type Row = Record<string, any>;
const value = (row: Row, key: string) => key.split(".").reduce((v, part) => v?.[part], row);
function fixture(overrides: Record<string, Row[]> = {}, failingTable?: string) {
  const tables: Record<string, Row[]> = {
    portal_ica_signatures: [], onboarding_records: [{ id: "old-enrollment", supabase_user_id: "agent" }],
    onboarding_contract_signatures: [], portal_document_requests: [], admin_audit_log: [], ...overrides,
  };
  const queries: Array<{ table: string; filters: unknown[]; ranges: unknown[] }> = [];
  const storageFrom = vi.fn(() => ({ createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "assigned-document-url" }, error: null })) }));
  const client = {
    from: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const record = { table, filters: [] as unknown[], ranges: [] as unknown[] };
      queries.push(record);
      const result = () => ({ data: rows, error: table === failingTable ? { message: "Lookup unavailable" } : null });
      const q = {
        select: () => q,
        eq: (key: string, expected: unknown) => { record.filters.push(["eq", key, expected]); rows = rows.filter(row => value(row, key) === expected); return q; },
        in: (key: string, expected: unknown[]) => { record.filters.push(["in", key, expected]); rows = rows.filter(row => expected.includes(value(row, key))); return q; },
        not: (key: string, _operator: string, _expected: null) => { record.filters.push(["not", key]); rows = rows.filter(row => value(row, key) != null); return q; },
        order: (key: string, options?: { ascending?: boolean }) => { if (key !== "id") rows.sort((a, b) => String(value(a, key)).localeCompare(String(value(b, key))) * (options?.ascending === false ? -1 : 1)); return q; },
        limit: (limit: number) => { rows = rows.slice(0, limit); return q; },
        range: async (start: number, end: number) => { record.ranges.push([start, end]); rows = rows.slice(start, end + 1); return result(); },
        maybeSingle: async () => ({ ...result(), data: rows[0] ?? null }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return q;
    },
    storage: { from: storageFrom },
  };
  return { client: client as never, queries, storageFrom };
}
const request = (extra: Row = {}): Row => ({
  id: "assigned-ica", user_id: "agent", released_at: "2026-11-13T18:50:08Z",
  signed_at: "2026-11-18T15:14:05Z", signature_name: "Test Agent", signed_pdf_path: "signatures/agent/assigned-ica/signed.pdf",
  campaign: { onboarding_asset_id: "configured-ica", onboarding_step: { slug: "ica_setup" } }, ...extra,
});
const reset = (created_at: string, target_user_id = "agent") => ({ id: `${target_user_id}-${created_at}`, target_user_id, action: "ica_reset", created_at });
const step = { slug: "ica_setup", completion_type: "auto" as const, auto_key: "ica", uploaded_signing: true };

describe("assigned ICA completion", () => {
  it("recognizes the saved ICA after a reset in status, admin completion and stage access", async () => {
    const f = fixture({ portal_document_requests: [request()], admin_audit_log: [reset("2026-11-17T17:23:12Z")] });
    const status = await resolveUserIcaStatus(f.client, "agent");
    expect(status).toMatchObject({ signed: true, source: "document_request", ica: { legalName: "Test Agent", signedAt: "2026-11-18T15:14:05Z", icaVersion: "document-request:configured-ica" } });
    const sets = await computeAutoCompletionSets(f.client, new Set(["ica"]), ["agent"]);
    const completed = isTodoCompleteForUser(step, "agent", {}, sets);
    expect(completed).toBe(true);
    const todos = [{ id: "ica_setup", phase: "on_board", completed }, { id: "document_request_assigned-ica", phase: "on_board", completed: true }, { id: "exam_study_tools", phase: "pre_license", completed: false }] as PortalTodo[];
    expect(derivePortalPhase(todos)).toBe("pre_license");
    expect(isStageLocked(todos, 1)).toBe(false);
    expect(f.queries.find(q => q.table === "portal_document_requests")?.filters).toContainEqual(["in", "user_id", ["agent"]]);
  });
  it("does not revive a historical signed request after a newer admin reset", async () => {
    const f = fixture({ portal_document_requests: [request({ signed_at: "2026-11-16T17:33:40Z" })], admin_audit_log: [reset("2026-11-17T22:02:03Z")] });
    expect(await resolveUserIcaStatus(f.client, "agent")).toEqual({ signed: false, source: null, ica: null });
    const sets = await computeAutoCompletionSets(f.client, new Set(["ica"]), ["agent"]);
    expect(isTodoCompleteForUser(step, "agent", { ica_setup: true }, sets)).toBe(false);
  });
  it.each([
    { signed_at: null }, { released_at: null }, { signed_pdf_path: null }, { signed_pdf_path: "" },
    { signature_name: "" }, { user_id: "another-agent" },
    { campaign: { title: "ICA guide", onboarding_step: { slug: "w9_setup" } } },
  ])("requires an owned, released, signed ICA with its saved PDF: %j", async extra => {
    const f = fixture({ portal_document_requests: [request(extra)] });
    expect((await resolveUserIcaStatus(f.client, "agent")).signed).toBe(false);
  });
  it("uses the signed document bucket for the assigned ICA download", async () => {
    const f = fixture({ portal_document_requests: [request()] });
    const status = await resolveUserIcaStatus(f.client, "agent");
    expect(await createIcaDownloadUrl(f.client, status)).toBe("assigned-document-url");
    expect(f.storageFrom).toHaveBeenCalledWith("portal-signing-documents");
    expect(f.storageFrom.mock.results[0].value.createSignedUrl).toHaveBeenCalledWith("signatures/agent/assigned-ica/signed.pdf", 3600);
  });
  it("preserves native and onboarding completion while adding only valid assigned signatures to a roster", async () => {
    const f = fixture({
      portal_ica_signatures: [{ user_id: "portal", legal_name: "Portal Agent", signed_at: "2026-11-18T15:00:00Z", pdf_path: "native.pdf" }],
      onboarding_records: [{ id: "enrollment", supabase_user_id: "onboarding" }],
      onboarding_contract_signatures: [{ onboarding_id: "enrollment", legal_name: "Onboarding Agent", signed_at: "2026-11-18T15:00:00Z", pdf_path: "onboarding.pdf" }],
      portal_document_requests: [request(), request({ user_id: "reset-agent" })],
      admin_audit_log: [reset("2026-11-18T16:00:00Z", "reset-agent")],
    });
    expect(await listIcaSignedUserIds(f.client, ["agent", "portal", "onboarding", "unsigned", "reset-agent"])).toEqual(new Set(["portal", "onboarding", "agent"]));
    for (const source of ["portal", "onboarding"] as const) {
      const status = await resolveUserIcaStatus(f.client, source);
      expect(status.source).toBe(source);
      expect(await createIcaDownloadUrl(f.client, status)).toBe(`${source}-url`);
    }
  });
  it("checks all pages of signed requests and reset history", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => request({ id: `request-${i}`, user_id: `agent-${i}` }));
    const f = fixture({ portal_document_requests: rows, admin_audit_log: [...Array.from({ length: 500 }, (_, i) => reset(`2026-11-19T00:00:00.${String(i).padStart(3, "0")}Z`, "agent-0")), reset("2026-11-18T16:00:00Z", "agent-500")] });
    const signed = await loadSignedIcaDocumentRequests(f.client, rows.map(row => row.user_id));
    expect(signed.size).toBe(499);
    expect(signed.has("agent-0")).toBe(false);
    expect(signed.has("agent-500")).toBe(false);
  });
  it.each(["portal_document_requests", "admin_audit_log"])("fails visibly when %s cannot be verified", async table => {
    const f = fixture({ portal_document_requests: [request()] }, table);
    await expect(resolveUserIcaStatus(f.client, "agent")).rejects.toThrow("Unable to verify");
  });
});
