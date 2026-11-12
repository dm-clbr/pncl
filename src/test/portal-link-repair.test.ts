import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { listOnboardingHolds } from "../../supabase/functions/_shared/onboardingHolds";
import { listPortalUsers } from "../../supabase/functions/_shared/adminAgents";
import { linkRepairMessages, portalLinkRepairStatus } from "../../supabase/functions/_shared/portalLinkRepair";
import { errorResponse, handleCors, jsonResponse } from "../../supabase/functions/_shared/cors";
import { canAccessAdminConsole } from "../../supabase/functions/_shared/adminRoles";

vi.mock("../../supabase/functions/_shared/adminAgents", () => ({ listPortalUsers: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalReferralInvites", () => ({ holdsDedupReservation: () => true }));
const recordId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000002";
const email = "rep@thepncl.com";
class AdminAuthError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}
function compiled(path: string) {
  return ts.transpileModule(readFileSync(path, "utf8").replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}
beforeEach(() => vi.clearAllMocks());
describe("admin account-link reconciliation", () => {
  function endpoint(denied = false) {
    let handler: (r: Request) => Promise<Response>;
    const rpc = vi.fn().mockResolvedValue({ data: { repaired: true }, error: null });
    const requireAdmin = vi.fn(async () => {
      if (denied) throw new AdminAuthError("Admin access required", 403, "forbidden");
      return { user: { id: "current-admin" }, adminClient: { rpc } };
    });
    new Function("serve", "requireAdmin", "AdminAuthError", "handleCors", "errorResponse", "jsonResponse", "isValidReferrerUserId", "linkRepairMessages",
      compiled("supabase/functions/admin-reconcile-onboarding-link/index.ts"))(
      (fn: typeof handler) => { handler = fn; }, requireAdmin, AdminAuthError, handleCors, errorResponse, jsonResponse,
      (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), linkRepairMessages,
    );
    return { rpc, request: (body: string) => handler!(new Request("https://hub.test/repair", { method: "POST", body })) };
  }
  it("uses the authenticated admin and revalidates the expected identity in the transaction", async () => {
    const route = endpoint();
    expect((await route.request(JSON.stringify({ onboardingId: recordId, expectedUserId: userId, adminId: "forged-admin" }))).status).toBe(200);
    expect(route.rpc).toHaveBeenCalledWith("reconcile_portal_account_link", { p_admin: "current-admin", p_onboarding: recordId, p_expected_user: userId });
  });
  it("rejects unauthorized requests before database access", async () => {
    const route = endpoint(true);
    expect((await route.request(JSON.stringify({ onboardingId: recordId, expectedUserId: userId }))).status).toBe(403);
    expect(route.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and invalid identifiers before mutation", async () => {
    const route = endpoint();
    for (const body of ["{", "null", JSON.stringify({ onboardingId: "invalid", expectedUserId: userId })]) {
      expect((await route.request(body)).status).toBe(400);
    }
    expect(route.rpc).not.toHaveBeenCalled();
  });
  it("returns a safe conflict message when the identity changes after preview", async () => {
    const route = endpoint();
    route.rpc.mockResolvedValue({ data: null, error: { message: "identity_conflict" } });
    const response = await route.request(JSON.stringify({ onboardingId: recordId, expectedUserId: userId }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: linkRepairMessages.identity_conflict });
  });
});
describe("missing-link detection", () => {
  it("finds an older missing link outside the newest records and makes it visible for review", async () => {
    vi.mocked(listPortalUsers).mockResolvedValue([{ id: userId, email }] as never);
    const older = { id: recordId, workspace_email: email, legal_name: "Example Rep", enrollment_status: "ready", status: "credentials_viewed", released_at: null, supabase_user_id: null };
    const client = {
      from: vi.fn(() => {
        const query = { select: vi.fn(() => query), order: vi.fn(() => query), is: vi.fn(() => query),
          limit: vi.fn(async () => ({ data: [], error: null })),
          range: vi.fn(async () => ({ data: [older], error: null })) };
        return query;
      }),
      rpc: vi.fn(async () => ({ data: { canRepair: true, reason: "repair_available" }, error: null })),
    };
    const holds = await listOnboardingHolds(client as never);
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({ onboardingId: recordId, needsAttention: true, linkRepair: { candidateUserId: userId, canRepair: true } });
  });
  it("fails closed when a repair-status check fails", async () => {
    await expect(portalLinkRepairStatus({ rpc: async () => ({ error: { message: "unavailable" } }) } as never, recordId, userId)).rejects.toThrow("Unable to verify");
  });
  it("gives completed but unlinked users a repair message without granting Hub access", async () => {
    const guard = new Function("AdminAuthError", "canAccessAdminConsole", `${compiled("supabase/functions/_shared/hubWorkEmail.ts")}\nreturn requireHubWorkEmail;`)(AdminAuthError, canAccessAdminConsole);
    const user = { id: userId, email, email_confirmed_at: "2026-07-22", app_metadata: {} };
    const row = { supabase_user_id: null, released_at: null, onboarding_completed_at: "2026-07-22" };
    const result = vi.fn().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: row, error: null });
    const query = { select: () => query, eq: () => query, maybeSingle: result };
    await expect(guard(user, { from: () => query })).rejects.toMatchObject({ status: 409, code: "onboarding_link_missing" });
    result.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: { ...row, onboarding_completed_at: null }, error: null });
    await expect(guard(user, { from: () => query })).rejects.toMatchObject({ code: "work_email_review_required" });
  });
});
