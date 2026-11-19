import { describe, expect, it } from "vitest";
import { buildCapacityStatus, capacityError, classifyGoogleCapacity, GoogleCapacityError } from "../../supabase/functions/_shared/googleCapacity";
import { holdsEnrollmentReservation } from "../../supabase/functions/_shared/enrollmentState";

describe("Google Workspace capacity classification", () => {
  it.each([
    "Google Workspace user creation failed: Domain user limit reached. Upgrade account.",
    "Domain user limit reached. Contact Support.",
    "Customer user limit exceeded.",
    "Maximum number of users has been reached",
    "userLimitExceeded",
  ])("recognizes a user cap: %s", (message) => expect(classifyGoogleCapacity(message)).toBe("user_limit"));
  it.each(["Insufficient licenses", "No available seats", "License limit exceeded", "No licenses are available"])("recognizes license capacity: %s", (message) => expect(classifyGoogleCapacity(message)).toBe("license_limit"));
  it.each(["Rate Limit Exceeded", "Quota exceeded for requests per minute", "User-rate limit exceeded", "Insufficient permissions", "Not Authorized to access this resource/api", "Invalid recovery email", "Unable to authenticate with Google Workspace"])("does not hide another error as capacity: %s", (message) => expect(classifyGoogleCapacity(message)).toBeNull());
  it("preserves an explicit mailbox activation wait", () => {
    const error = new GoogleCapacityError("mailbox_pending", "Gmail is not active");
    expect(capacityError(error)).toBe(error);
  });
  it("keeps waiting applicants reserved even after 24 hours", () => {
    expect(holdsEnrollmentReservation({ status: "pending", enrollment_status: "waiting_google_capacity", released_at: null, updated_at: "2020-01-01T00:00:00Z" })).toBe(true);
    expect(holdsEnrollmentReservation({ status: "pending", enrollment_status: "waiting_google_capacity", released_at: "2020-01-01T00:00:00Z" })).toBe(false);
  });
  it("returns only non-sensitive waiting data, including while a background retry runs", () => {
    const row = { enrollment_status: "provisioning_google", capacity_wait_started_at: "2026-11-19T00:00:00Z", capacity_next_retry_at: "2026-11-19T00:05:00Z", workspace_email: "private@example.com", temporary_password_encrypted: "secret", handoff_token_hash: "hash" };
    expect(buildCapacityStatus(row)).toMatchObject({ status: "waiting_capacity", retryable: false, credentialsAvailable: false });
    expect(JSON.stringify(buildCapacityStatus(row))).not.toMatch(/private@example|secret|hash/);
    expect(buildCapacityStatus({ ...row, released_at: "2026-11-19T01:00:00Z" })).toBeNull();
    expect(buildCapacityStatus({ ...row, capacity_recovered_at: "2026-11-19T01:00:00Z" })).toBeNull();
  });
});
