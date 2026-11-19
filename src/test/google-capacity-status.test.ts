import { beforeEach, expect, it, vi } from "vitest";
const { serve, record, valid } = vi.hoisted(() => ({ serve: vi.fn(), record: { current: {} as Record<string, unknown> }, valid: { current: true } }));
vi.mock("https://deno.land/std@0.177.0/http/server.ts", () => ({ serve }));
vi.mock("../../supabase/functions/_shared/onboarding", () => ({
  getServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: record.current, error: null }) }) }) }) }),
  isTokenExpired: () => true, buildGmailUrl: vi.fn(), isAutoSuspendedOnboardingFailure: () => false,
}));
vi.mock("../../supabase/functions/_shared/security", () => ({ validateHandoffToken: async () => valid.current }));
vi.mock("../../supabase/functions/_shared/logger", () => ({ logOnboarding: vi.fn() }));
let handler: (req: Request) => Promise<Response>;
beforeEach(async () => {
  record.current = { enrollment_status: "waiting_google_capacity", capacity_wait_started_at: "2026-11-19", workspace_email: "private@thepncl.com", temporary_password_encrypted: "secret", handoff_token_hash: "secret-hash" };
  valid.current = true;
  await import("../../supabase/functions/get-onboarding-status/index");
  handler = serve.mock.calls[0][0];
});
it("keeps long waits visible with an expired matching link without disclosing credentials", async () => {
  const response = await handler(new Request("https://example.com/?id=agent&token=matching"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ status: "waiting_capacity", credentialsAvailable: false });
  expect(JSON.stringify(body)).not.toMatch(/private@|secret/);
});
it("still rejects an invalid token before disclosing even the waiting state", async () => {
  valid.current = false;
  const response = await handler(new Request("https://example.com/?id=agent&token=wrong"));
  expect(response.status).toBe(403);
});
it("requires a fresh link once the account recovers", async () => {
  record.current.enrollment_status = "awaiting_google_sign_in";
  record.current.capacity_recovered_at = "2026-11-19";
  const response = await handler(new Request("https://example.com/?id=agent&token=matching"));
  expect(await response.json()).toMatchObject({ status: "expired" });
});
