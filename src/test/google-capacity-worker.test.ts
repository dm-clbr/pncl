import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processCapacityQueue } from "../../supabase/functions/_shared/googleCapacityWorker";
import { provisionEnrollment } from "../../supabase/functions/_shared/enrollmentProvisioning";
import { getOrCreateEnrollmentHandoff } from "../../supabase/functions/_shared/enrollmentHandoff";
import { sendCapacityAdminNotification } from "../../supabase/functions/_shared/googleCapacityNotifications";
vi.mock("../../supabase/functions/_shared/enrollmentProvisioning", () => ({ provisionEnrollment: vi.fn() }));
vi.mock("../../supabase/functions/_shared/enrollmentHandoff", () => ({ getOrCreateEnrollmentHandoff: vi.fn() }));
vi.mock("../../supabase/functions/_shared/googleCapacityNotifications", () => ({ capacityAdminRecipients: vi.fn(() => ["admin@thepncl.com"]), sendCapacityAdminNotification: vi.fn() }));
vi.mock("../../supabase/functions/_shared/resend", () => ({ getResendApiKey: vi.fn(() => "test-key") }));
vi.mock("../../supabase/functions/_shared/logger", () => ({ logOnboarding: vi.fn() }));
type Row = Record<string, unknown>;
function clientFor({ due = [], pending = [], record = {} }: { due?: Row[]; pending?: Row[]; record?: Row } = {}) {
  const writes: { table: string; values: Row; filters: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    let values: Row | undefined;
    const filters: unknown[] = [];
    const q = {
      select: () => q, not: (...args: unknown[]) => { filters.push(args); return q; },
      is: (...args: unknown[]) => { filters.push(args); return q; },
      in: (...args: unknown[]) => { filters.push(args); return q; },
      eq: (...args: unknown[]) => { filters.push(args); return q; },
      lte: () => q, or: () => q, order: () => q, limit: () => q,
      update: (v: Row) => { values = v; return q; },
      maybeSingle: async () => ({ data: record, error: null }),
      then: (resolve: (r: unknown) => unknown) => {
        if (values) writes.push({ table, values, filters });
        return Promise.resolve(resolve({ data: values ? null : table === "onboarding_records" ? due : pending, error: null }));
      },
    };
    return q;
  });
  return { from, writes };
}
const notice = { id: "notice-1", onboarding_id: "enrollment-1", event: "waiting", attempts: 0 };
const record = { id: "enrollment-1", legal_name: "Test Agent", workspace_email: "test@thepncl.com", enrollment_status: "waiting_google_capacity" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
});
afterEach(() => vi.unstubAllGlobals());
describe("durable capacity worker", () => {
  it("runs saved enrollment recovery without a browser and releases its own lease", async () => {
    const db = clientFor({ due: [{ id: "enrollment-1" }] });
    expect(await processCapacityQueue(db as never, "lease-1")).toEqual({ completed: 1, notifications: 0, error: null });
    expect(provisionEnrollment).toHaveBeenCalledWith(db, "enrollment-1", { requestId: "lease-1", capacityRetry: true });
    expect(db.writes.at(-1)).toMatchObject({ table: "onboarding_capacity_worker_state", values: { lease_token: null }, filters: [["id", true], ["lease_token", "lease-1"]] });
  });
  it("reschedules a transport failure without losing the waiting notification", async () => {
    vi.mocked(provisionEnrollment).mockRejectedValue(new Error("Database temporarily unavailable"));
    const db = clientFor({ due: [{ id: "enrollment-1" }], pending: [notice], record });
    const result = await processCapacityQueue(db as never, "lease");
    expect(result).toMatchObject({ completed: 0, notifications: 1 });
    expect(db.writes[0]).toMatchObject({ table: "onboarding_records", values: { capacity_next_retry_at: expect.any(String) } });
    expect(sendCapacityAdminNotification).toHaveBeenCalledOnce();
  });
  it("keeps email failures in the outbox and does not undo completed account creation", async () => {
    vi.mocked(sendCapacityAdminNotification).mockRejectedValue(new Error("Email temporarily unavailable"));
    const db = clientFor({ pending: [notice], record });
    await processCapacityQueue(db as never, "lease");
    expect(db.writes[0]).toMatchObject({ table: "onboarding_capacity_notifications", values: { attempts: 1, next_attempt_at: expect.any(String), last_error: "Email temporarily unavailable" } });
    expect(db.writes.every(w => w.table !== "onboarding_records")).toBe(true);
    expect(db.writes[0].values.sent_at).toBeUndefined();
  });
  it("sends the recovered agent's private resume link to the admin", async () => {
    vi.mocked(getOrCreateEnrollmentHandoff).mockResolvedValue({ token: "fresh-token" } as never);
    const db = clientFor({ pending: [{ ...notice, event: "ready" }], record: { ...record, enrollment_status: "awaiting_google_sign_in", capacity_recovered_at: "2026-11-19" } });
    await processCapacityQueue(db as never, "lease");
    expect(getOrCreateEnrollmentHandoff).toHaveBeenCalledWith(db, "enrollment-1");
    expect(sendCapacityAdminNotification).toHaveBeenCalledWith(expect.objectContaining({ event: "ready", resumeUrl: "https://www.thepncl.com/onboarding/success/enrollment-1?token=fresh-token" }));
    expect(db.writes[0].values.sent_at).toEqual(expect.any(String));
  });
  it.each([{ ...record, released_at: "2026-11-19" }, { ...record, capacity_recovered_at: "2026-11-19" }])("does not send an obsolete waiting notice", async row => {
    const db = clientFor({ pending: [notice], record: row });
    await processCapacityQueue(db as never, "lease");
    expect(sendCapacityAdminNotification).not.toHaveBeenCalled();
    expect(db.writes[0].values.last_error).toBe("superseded_or_released");
  });
  it("never generates credentials for a ready notice whose enrollment is no longer ready", async () => {
    const db = clientFor({ pending: [{ ...notice, event: "ready" }], record });
    await processCapacityQueue(db as never, "lease");
    expect(getOrCreateEnrollmentHandoff).not.toHaveBeenCalled();
    expect(sendCapacityAdminNotification).not.toHaveBeenCalled();
    expect(db.writes[0].values.attempts).toBe(1);
  });
});
