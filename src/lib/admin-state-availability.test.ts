import { afterEach, describe, expect, it, vi } from "vitest";
import { updateStateAvailability } from "@/lib/admin-state-availability";

vi.mock("@/lib/supabase", () => ({
  getSupabaseConfig: () => ({ url: "https://example.supabase.co", anonKey: "anon-key" }),
}));

describe("admin state availability client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a protected batch update to the full-admin endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      states: [],
      message: "1 state status updated.",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateStateAvailability("admin-token", [
      { stateCode: "UT", status: "Active" },
    ])).resolves.toMatchObject({ message: "1 state status updated." });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/admin-update-state-availability",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer admin-token" }),
        body: JSON.stringify({ updates: [{ stateCode: "UT", status: "Active" }] }),
      }),
    );
  });
});
