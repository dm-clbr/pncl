import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendDocumentNotifications } from "../../supabase/functions/_shared/documentNotifications";
const state = vi.hoisted(() => ({ key: vi.fn(() => "test-key") }));
vi.mock("../../supabase/functions/_shared/resend.ts", () => ({ getResendApiKey: state.key, getFromAddress: () => "PNCL <test@example.invalid>" }));
const rpc = vi.fn(); const update = vi.fn(); const fetchMock = vi.fn();
const row = { id: "request-1", campaign_id: "campaign-1", user_id: "agent-1" };
const client = {
  rpc,
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { title: "Terms <updated>" }, error: null }) }) }), update }),
  auth: { admin: { getUserById: async () => ({ data: { user: { email: "agent@example.invalid" } }, error: null }) } },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Deno", { env: { get: () => "https://portal.example.invalid" } });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal });
  rpc.mockResolvedValue({ data: [row], error: null });
  update.mockReturnValue({ eq: async () => ({ error: null }) });
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
});
afterEach(() => vi.unstubAllGlobals());
describe("document email delivery", () => {
  it("uses only the claimed scope and links to authenticated signing with an idempotency key", async () => {
    expect(await sendDocumentNotifications(client as never, { userId: "agent-1", retry: false })).toEqual({ sent: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledWith("claim_document_notifications", { p_campaign: null, p_user: "agent-1", p_retry: false });
    const options = fetchMock.mock.calls[0][1];
    expect(options.headers["Idempotency-Key"]).toBe("document-request-request-1");
    const body = JSON.parse(options.body);
    expect(body.to).toEqual(["agent@example.invalid"]);
    expect(body.html).toContain("https://portal.example.invalid/portal/documents?request=request-1");
    expect(body.html).toContain("Terms &lt;updated&gt;");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ notification_status: "sent" }));
  });
  it("keeps provider failures retryable", async () => {
    fetchMock.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    expect(await sendDocumentNotifications(client as never, { campaignId: "campaign-1" })).toEqual({ sent: 0, failed: 1 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ notification_status: "failed", notification_error: expect.stringContaining("503") }));
  });
  it("validates configuration before claiming notifications", async () => {
    vi.stubGlobal("Deno", { env: { get: () => undefined } });
    await expect(sendDocumentNotifications(client as never, { campaignId: "campaign-1" })).rejects.toThrow("PNCL_SITE_URL");
    expect(rpc).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends nothing when no released requests are claimed", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await sendDocumentNotifications(client as never, { campaignId: "campaign-1" })).toEqual({ sent: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
