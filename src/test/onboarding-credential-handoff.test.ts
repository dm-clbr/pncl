import { describe, expect, it } from "vitest";
import { canRevealTemporaryPassword } from "../../supabase/functions/_shared/onboardingCredentials";
import { resolveOnboardingViewState } from "../lib/onboarding-view-state";

const revealableRecord = {
  enrollment_status: "awaiting_google_sign_in",
  google_user_id: "google-user-1",
  supabase_user_id: "portal-user-1",
  google_first_sign_in_at: null,
  temporary_password_encrypted: "encrypted-password",
  workspace_email: "agent@thepncl.com",
};

describe("onboarding credential handoff", () => {
  it("allows reveal in the normal post-provisioning state", () => {
    expect(canRevealTemporaryPassword(revealableRecord)).toBe(true);
  });

  it("keeps the password revealable after it has previously been viewed", () => {
    expect(canRevealTemporaryPassword({
      ...revealableRecord,
      enrollment_status: "ready",
    })).toBe(true);
  });

  it("stops revealing after Google sign-in succeeds", () => {
    expect(canRevealTemporaryPassword({
      ...revealableRecord,
      google_first_sign_in_at: "2026-08-18T18:00:00.000Z",
    })).toBe(false);
  });

  it("does not reveal before both accounts and the encrypted password exist", () => {
    expect(canRevealTemporaryPassword({
      ...revealableRecord,
      supabase_user_id: null,
    })).toBe(false);
    expect(canRevealTemporaryPassword({
      ...revealableRecord,
      temporary_password_encrypted: null,
    })).toBe(false);
  });

  it("returns agents to the repeat-reveal state after a refresh", () => {
    expect(resolveOnboardingViewState({
      status: "email_created",
      credentialsViewed: true,
      credentialsAvailable: true,
    }, null)).toBe("viewed");
  });
});
