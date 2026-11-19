import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildLowCapacityEmail, processGoogleSeatAlerts } from "../../supabase/functions/_shared/googleSeatAlerts";
import { countWorkspaceUsers } from "../../supabase/functions/_shared/googleWorkspace";
import { sendEmail } from "../../supabase/functions/_shared/resend";
vi.mock("../../supabase/functions/_shared/googleWorkspace", () => ({ countWorkspaceUsers: vi.fn() }));
vi.mock("../../supabase/functions/_shared/googleCapacityNotifications", () => ({ capacityAdminRecipients: () => ["admin@thepncl.com"] }));
vi.mock("../../supabase/functions/_shared/resend", () => ({ sendEmail: vi.fn() }));
type Row = Record<string, unknown>;
const baseConfig = { enabled: true, account_limit: 400, cycle_id: "cycle-1", next_check_at: "2026-11-19T00:00:00Z" };
const notice = { id: "alert-1", cycle_id: "cycle-1", threshold: 10, remaining: 10, used_count: 390, account_limit: 400, observed_at: "2026-11-19T00:00:00Z", attempts: 0 };
function database(config = baseConfig, alerts: Row[] = []) {
  const writes: { table: string; patch: Row }[] = [];
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const from = (table: string) => {
    let patch: Row | undefined;
    const q = {
      select: () => q, eq: () => q, is: () => q, lte: () => q, order: () => q, limit: () => q,
      update: (v: Row) => { patch = v; return q; },
      maybeSingle: async () => ({ data: config, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (patch) writes.push({ table, patch });
        return Promise.resolve(resolve({ data: patch ? null : alerts, error: null }));
      },
    }; return q;
  }; return { from, rpc, writes };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-19T01:00:00Z")); vi.mocked(countWorkspaceUsers).mockResolvedValue(390); });
afterEach(() => vi.useRealTimers());
it("records a live count under the current worker lease", async () => {
 const db = database();
 expect(await processGoogleSeatAlerts(db as never, "lease")).toBeNull();
 expect(db.rpc).toHaveBeenCalledWith("google_capacity_record_count", { p_used: 390, p_limit: 400, p_observed_at: "2026-11-19T01:00:00.000Z", p_lease_token: "lease" });
});
it.each([{ ...baseConfig, enabled: false }, { ...baseConfig, next_check_at: "2026-11-19T02:00:00Z" }])("respects disabled/not-due monitoring", async config => {
 await processGoogleSeatAlerts(database(config) as never, "lease");
 expect(countWorkspaceUsers).not.toHaveBeenCalled();
});
it("preserves the last known count after a Google API failure and schedules a retry", async () => {
 vi.mocked(countWorkspaceUsers).mockRejectedValue(new Error("Google unavailable"));
 const db = database();
 expect(await processGoogleSeatAlerts(db as never, "lease")).toBe("Google unavailable");
 expect(db.rpc).not.toHaveBeenCalled();
 expect(db.writes[0]).toEqual({ table: "google_capacity_monitor", patch: { last_error: "Google unavailable", next_check_at: "2026-11-19T01:05:00.000Z" } });
});
it("sends one queued alert to the configured admins with a stable idempotency key", async () => {
 const db = database(baseConfig, [notice]);
 await processGoogleSeatAlerts(db as never, "lease");
 expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["admin@thepncl.com"], idempotencyKey: "google-capacity-alert/alert-1", subject: "Warning: 10 Google account spaces remaining — PNCL" }));
 expect(db.writes[0].patch.sent_at).toBe("2026-11-19T01:00:00.000Z");
});
it("keeps a failed email queued without marking it delivered", async () => {
 vi.mocked(sendEmail).mockRejectedValue(new Error("Email unavailable"));
 const db = database(baseConfig, [notice]);
 await processGoogleSeatAlerts(db as never, "lease");
 expect(db.writes[0].patch).toEqual({ attempts: 1, last_error: "Email unavailable", next_attempt_at: "2026-11-19T01:05:00.000Z" });
});
it("does not send an alert from an older capacity cycle", async () => {
 const db = database({ ...baseConfig, cycle_id: "new-cycle" }, [notice]);
 await processGoogleSeatAlerts(db as never, "lease");
 expect(sendEmail).not.toHaveBeenCalled();
});
it("makes the urgent alert clear even when the account cap is exceeded", () => {
 const email = buildLowCapacityEmail({ ...notice, threshold: 5, remaining: -1, used_count: 401 });
 expect(email.subject).toBe("Urgent: 0 Google account spaces remaining — PNCL");
 expect(email.html).toContain("401 accounts");
 expect(email.html).toContain("separately from Gmail license availability");
});
