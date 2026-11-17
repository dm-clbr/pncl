import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncPortalRecoveryEmailForUser } from "../../supabase/functions/_shared/portalRecoveryEmail";
import { updateWorkspaceUserRecovery } from "../../supabase/functions/_shared/googleWorkspace";
vi.mock("../../supabase/functions/_shared/googleWorkspace", () => ({ getWorkspaceUser: async () => ({ id: "google-id" }), updateWorkspaceUserRecovery: vi.fn() }));
vi.mock("../../supabase/functions/_shared/onboarding", () => ({ getEmailDomain: () => "thepncl.com" }));
vi.mock("../../supabase/functions/_shared/logger", () => ({ logOnboarding: vi.fn() }));

const user = { id: "agent-id", email: "agent@thepncl.com", user_metadata: { full_name: "Old Company LLC" } };
function database(existing = true) {
  const writes: { operation: string; table: string; payload: Record<string, unknown>; filters: unknown[] }[] = [];
  const from = (table: string) => {
    let write: typeof writes[number] | undefined;
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (...filter: unknown[]) => { write?.filters.push(filter); return query; },
      maybeSingle: async () => ({ data: table === "onboarding_records" ? { id: "record", first_name: "Original", last_name: "Name" } : existing ? { user_id: user.id, first_name: "Edited", last_name: "Name" } : null, error: null }),
      update: (payload: Record<string, unknown>) => { write = { operation: "update", table, payload, filters: [] }; writes.push(write); return query; },
      upsert: (payload: Record<string, unknown>) => { write = { operation: "upsert", table, payload, filters: [] }; writes.push(write); return query; },
      then: (resolve: (value: unknown) => void) => Promise.resolve({ error: null }).then(resolve),
    };
    return query;
  };
  return { client: { from } as never, writes };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(updateWorkspaceUserRecovery).mockResolvedValue({ updated: true } as never); });
describe("recovery email persistence", () => {
  it("updates the existing user's profile without upserting a null ID or replacing edited names", async () => {
    const db = database();
    expect((await syncPortalRecoveryEmailForUser(db.client, user as never, "personal@example.com")).syncStatus).toBe("synced");
    const pending = db.writes[0];
    expect(pending.operation).toBe("update");
    expect(pending.filters).toContainEqual(["user_id", user.id]);
    expect(pending.payload).not.toHaveProperty("first_name");
    expect(pending.payload).not.toHaveProperty("last_name");
    expect(pending.payload.recovery_email_sync_status).toBe("pending");
  });
  it("creates a missing profile with a user ID and names", async () => {
    const db = database(false);
    await syncPortalRecoveryEmailForUser(db.client, user as never, "personal@example.com");
    expect(db.writes[0]).toMatchObject({ operation: "upsert", payload: { user_id: user.id, first_name: "Original", last_name: "Name" } });
  });
  it("keeps a retryable state if Workspace fails", async () => {
    vi.mocked(updateWorkspaceUserRecovery).mockRejectedValue(new Error("Workspace unavailable"));
    const db = database();
    const result = await syncPortalRecoveryEmailForUser(db.client, user as never, "personal@example.com");
    expect(result.syncStatus).toBe("error");
    expect(db.writes.at(-1)).toMatchObject({ payload: { recovery_email_sync_status: "error" }, filters: [["user_id", user.id]] });
  });
});
