import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("preserves token error codes and passes the request cancellation signal", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "invalid_token", message: "Invalid sign-in handoff token." }) });
  vi.stubGlobal("fetch", fetch);
  const { getOnboardingStatus } = await import("../lib/onboarding-api");
  const controller = new AbortController();
  await expect(getOnboardingStatus("enrollment-1", "bad-token", controller.signal)).rejects.toMatchObject({ code: "invalid_token", status: 403 });
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }));
});
