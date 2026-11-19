import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capacityAdminRecipients, buildCapacityEmail, sendCapacityAdminNotification } from "../../supabase/functions/_shared/googleCapacityNotifications";
vi.mock("../../supabase/functions/_shared/logger", () => ({ logOnboarding: vi.fn() }));
let env: Record<string, string>;
const fetchMock = vi.fn();
beforeEach(() => {
  env = { GOOGLE_WORKSPACE_ADMIN_EMAIL: "Admin@thepncl.com", RESEND_API_KEY: "test-key" };
  vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(new Response("{}"));
});
afterEach(() => vi.unstubAllGlobals());
describe("capacity admin alerts", () => {
  it("falls back to the existing Workspace admin and accepts a dedicated deduplicated list", () => {
    expect(capacityAdminRecipients()).toEqual(["admin@thepncl.com"]);
    env.PNCL_GOOGLE_CAPACITY_NOTIFY_EMAILS = "One@thepncl.com, two@thepncl.com, one@thepncl.com";
    expect(capacityAdminRecipients()).toEqual(["one@thepncl.com", "two@thepncl.com"]);
  });
  it.each(["", "invalid-address"])('rejects a missing/invalid admin configuration (%s)', value => {
    env.GOOGLE_WORKSPACE_ADMIN_EMAIL = value;
    expect(capacityAdminRecipients).toThrow("not configured");
  });
  it("escapes applicant content and link attributes", () => {
    const email = buildCapacityEmail({ name: '<img src=x onerror="bad">', email: "<bad>", event: "ready", adminUrl: 'https://example.com/"', resumeUrl: "https://example.com/?a=1&b=2" });
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
    expect(email.html).toContain("&amp;b=2");
  });
  it.each(["waiting", "ready", "attention"])("delivers the %s alert with an idempotency key and bounded timeout", async event => {
    await sendCapacityAdminNotification({ id: "notice-1", name: "Test Agent", email: "test@thepncl.com", event });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request.headers["Idempotency-Key"]).toBe("capacity-notice/notice-1");
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(request.body);
    expect(body.to).toEqual(["admin@thepncl.com"]);
    expect(body.html).toContain("Agent enrollments");
  });
  it("propagates delivery failure so the outbox can retry", async () => {
    fetchMock.mockResolvedValue(new Response("service unavailable", { status: 503 }));
    await expect(sendCapacityAdminNotification({ id: "notice", name: "Test", email: "test@thepncl.com", event: "waiting" })).rejects.toThrow("Unable to send email");
  });
});
