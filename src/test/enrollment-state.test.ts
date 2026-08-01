import { describe, expect, it } from "vitest";
import {
  holdsEnrollmentReservation,
  isEnrollmentReady,
  RESERVATION_TTL_MS,
} from "../../supabase/functions/_shared/enrollmentState";

describe("enrollment state", () => {
  const complete = {
      referral_status: "finalized",
      contract_status: "finalized",
      application_status: "finalized",
      google_account_status: "ready",
      portal_account_status: "ready",
      finalization_status: "ready",
  };

  it("marks the complete success path ready", () => {
    expect(isEnrollmentReady(complete)).toBe(true);
  });

  it("does not report ready after portal provisioning fails", () => {
    expect(isEnrollmentReady({ ...complete, portal_account_status: "failed" })).toBe(false);
  });

  it("keeps protection for a created external account", () => {
    expect(holdsEnrollmentReservation({
      status: "failed",
      enrollment_status: "needs_attention",
      google_user_id: "google-1",
      released_at: null,
    })).toBe(true);
  });

  it("releases failed attempts with no external account", () => {
    expect(holdsEnrollmentReservation({
      status: "failed",
      enrollment_status: "needs_attention",
      workspace_email: "reserved@thepncl.com",
      released_at: null,
    })).toBe(false);
  });

  it("ages out an abandoned in-flight reservation", () => {
    const now = Date.UTC(2026, 7, 1);
    expect(holdsEnrollmentReservation({
      status: "creating_email",
      enrollment_status: "provisioning_google",
      released_at: null,
      last_provisioning_attempt_at: new Date(now - RESERVATION_TTL_MS - 1).toISOString(),
    }, now)).toBe(false);
  });
});
