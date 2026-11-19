import { GoogleCapacityError } from "../../supabase/functions/_shared/googleCapacity";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { provisionEnrollment } from "../../supabase/functions/_shared/enrollmentProvisioning";
import { createWorkspaceUser, getWorkspaceUser, waitForWorkspaceMailboxReady } from "../../supabase/functions/_shared/googleWorkspace";
import { provisionPortalAccount } from "../../supabase/functions/_shared/portalAuth";
import { generateTemporaryPassword } from "../../supabase/functions/_shared/security";

vi.mock("../../supabase/functions/_shared/googleWorkspace", () => ({
  getWorkspaceUser: vi.fn(), createWorkspaceUser: vi.fn(),
  waitForWorkspaceMailboxReady: vi.fn(), updateWorkspaceUserRecovery: vi.fn(),
  isAutomaticallySuspendedGoogleUser: vi.fn(),
  GoogleWorkspaceAutoSuspendedError: class extends Error {},
}));
vi.mock("../../supabase/functions/_shared/portalAuth", () => ({
  provisionPortalAccount: vi.fn(), markPortalEnrollmentReady: vi.fn(),
}));
// Keep the real profile sync: mocking it hid the missing recovery-email argument.
vi.mock("../../supabase/functions/_shared/onboarding", () => ({ decodeImageBytes: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalReferralInvites", () => ({
  attachOnboardingToReferralInvite: vi.fn(), findActiveOnboardingByPhoneNumber: vi.fn(),
  findActiveOnboardingBySsnHash: vi.fn(), upsertPortalProfileCompLevel: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/portalAgentDesignations", () => ({ initializePortalAgentDesignation: vi.fn() }));
vi.mock("../../supabase/functions/_shared/security", () => ({
  decryptTemporaryPassword: vi.fn(), encryptTemporaryPassword: vi.fn(), generateTemporaryPassword: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/logger", () => ({ logOnboarding: vi.fn() }));

function clientFor(existingAccounts = false) {
  const row = {
    id: "enrollment-1", legal_name: "Test Recruit", first_name: "Test", last_name: "Recruit",
    workspace_email: "test@thepncl.com", personal_email: "Recruit@Example.com",
    temporary_password_encrypted: "saved-password", google_user_id: existingAccounts ? "google-1" : null,
    supabase_user_id: existingAccounts ? "portal-1" : null, referral_invite_id: null,
    contract_signature_id: "contract-1", invited_comp_level: null, state_of_residence: "UT",
    enrollment_status: existingAccounts ? "needs_attention" : "application_saved",
    status: existingAccounts ? "failed" : "pending", finalization_status: "pending",
    failure_code: existingAccounts ? "finalization_failed" : null, failure_detail: null,
    npn: null, address_line1: null, address_city: null, address_zip: null, county: null,
  };
  const profileUpsert = vi.fn().mockResolvedValue({ error: null });
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    if (table === "portal_profiles") return { upsert: profileUpsert };
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
      update: (values: Record<string, unknown>) => {
        if (table === "onboarding_records") {
          updates.push(values);
          Object.assign(row, values);
        }
        const query = {
          eq: () => query, or: () => query, select: () => query,
          maybeSingle: async () => ({ data: { ...row }, error: null }),
          then: (resolve: (value: unknown) => void) => resolve({ error: null }),
        };
        return query;
      },
    };
  });
  return { from, row, updates, profileUpsert };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createWorkspaceUser).mockResolvedValue("google-1");
  vi.mocked(getWorkspaceUser).mockResolvedValue(null);
  vi.mocked(provisionPortalAccount).mockResolvedValue("portal-1");
});

describe("enrollment profile finalization", () => {
  it("preserves the durable portal link when a later welcome email fails", async () => {
    const client = clientFor();
    vi.mocked(provisionPortalAccount).mockImplementationOnce(async () => {
      Object.assign(client.row, { supabase_user_id: "persisted-portal" });
      throw new Error("Welcome email failed");
    });
    const failed = await provisionEnrollment(client as never, client.row.id);
    expect(failed).toMatchObject({ status: "failed", failedStep: "portal", supabaseUserId: "persisted-portal" });
    expect(client.row.supabase_user_id).toBe("persisted-portal");
  });
  it("saves the personal recovery email through the real profile sync before completing a new enrollment", async () => {
    const client = clientFor();
    const result = await provisionEnrollment(client as never, client.row.id);
    expect(result.enrollmentStatus).toBe("awaiting_google_sign_in");
    expect(client.profileUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "portal-1", recovery_email: "recruit@example.com", recovery_email_sync_status: "synced",
    }), { onConflict: "user_id" });
    expect(client.row).toMatchObject({ status: "email_created", finalization_status: "ready", failure_code: null });
  });

  it("resumes a saved finalization failure using the existing accounts and password", async () => {
    const client = clientFor(true);
    vi.mocked(getWorkspaceUser).mockResolvedValue({ id: "google-1", suspended: false } as never);
    const result = await provisionEnrollment(client as never, client.row.id);
    expect(result.enrollmentStatus).toBe("awaiting_google_sign_in");
    expect(createWorkspaceUser).not.toHaveBeenCalled();
    expect(generateTemporaryPassword).not.toHaveBeenCalled();
    expect(provisionPortalAccount).toHaveBeenCalledWith(client, expect.objectContaining({ existingSupabaseUserId: "portal-1" }));
    expect(client.row).toMatchObject({ google_user_id: "google-1", supabase_user_id: "portal-1", temporary_password_encrypted: "saved-password", failure_code: null });
  });

  it("keeps real profile-write failures recoverable and completes when the write succeeds on retry", async () => {
    const client = clientFor();
    client.profileUpsert.mockResolvedValueOnce({ error: { message: "Profile temporarily unavailable" } });
    const failed = await provisionEnrollment(client as never, client.row.id);
    expect(failed).toMatchObject({ status: "failed", failedStep: "finalization" });
    expect(client.row).toMatchObject({ google_user_id: "google-1", supabase_user_id: "portal-1", finalization_status: "failed", failure_detail: "Unable to save portal profile: Profile temporarily unavailable" });
    vi.mocked(getWorkspaceUser).mockResolvedValue({ id: "google-1", suspended: false } as never);
    const retried = await provisionEnrollment(client as never, client.row.id);
    expect(retried.enrollmentStatus).toBe("awaiting_google_sign_in");
    expect(createWorkspaceUser).toHaveBeenCalledTimes(1);
    expect(client.row).toMatchObject({ status: "email_created", failure_code: null, failure_detail: null });
  });
});


describe("capacity provisioning recovery", () => {
  it("saves a quota failure without releasing the application and resumes the same record", async () => {
    const client = clientFor();
    vi.mocked(createWorkspaceUser).mockRejectedValueOnce(new Error("Google Workspace user creation failed: Domain user limit reached. Contact Support."));
    const waiting = await provisionEnrollment(client as never, client.row.id);
    expect(waiting).toMatchObject({ status: "waiting_capacity", enrollmentStatus: "waiting_google_capacity" });
    expect(client.row).toMatchObject({ status: "pending", released_at: null, contract_signature_id: "contract-1", temporary_password_encrypted: "saved-password", google_account_status: "waiting_capacity", capacity_retry_attempts: 1 });
    expect(provisionPortalAccount).not.toHaveBeenCalled();
    expect(client.profileUpsert).not.toHaveBeenCalled();
    const recovered = await provisionEnrollment(client as never, client.row.id, { capacityRetry: true });
    expect(recovered.enrollmentStatus).toBe("awaiting_google_sign_in");
    expect(client.row).toMatchObject({ status: "email_created", capacity_next_retry_at: null, failure_code: null });
    expect(client.row).toHaveProperty("capacity_recovered_at", expect.any(String));
    expect(generateTemporaryPassword).not.toHaveBeenCalled();
  });

  it("retains a partially created Google account while waiting for its license, then reuses it", async () => {
    const client = clientFor();
    vi.mocked(waitForWorkspaceMailboxReady).mockRejectedValueOnce(new GoogleCapacityError("mailbox_pending", "Gmail needs a license"));
    expect(await provisionEnrollment(client as never, client.row.id)).toMatchObject({ status: "waiting_capacity", googleUserId: "google-1" });
    expect(client.row.google_user_id).toBe("google-1");
    vi.mocked(getWorkspaceUser).mockResolvedValue({ id: "google-1", suspended: false, isMailboxSetup: true } as never);
    expect((await provisionEnrollment(client as never, client.row.id, { capacityRetry: true })).enrollmentStatus).toBe("awaiting_google_sign_in");
    expect(createWorkspaceUser).toHaveBeenCalledTimes(1);
  });

  it.each([new Error("Unable to load Google Workspace user (503)"), new DOMException("Timed out", "TimeoutError")])("keeps an existing capacity wait queued during a provider outage", async error => {
    const client = clientFor();
    Object.assign(client.row, { enrollment_status: "waiting_google_capacity", capacity_wait_started_at: "2026-11-19T00:00:00Z", failure_code: "google_capacity_user_limit" });
    vi.mocked(getWorkspaceUser).mockRejectedValueOnce(error);
    expect(await provisionEnrollment(client as never, client.row.id, { capacityRetry: true })).toMatchObject({ status: "waiting_capacity" });
    expect(client.row).toMatchObject({ released_at: null, failure_code: "google_capacity_user_limit", capacity_next_retry_at: expect.any(String) });
  });

  it.each(["Insufficient permissions", "Rate Limit Exceeded", "Invalid recovery email"])("does not automatically retry a different failure: %s", async (message) => {
    const client = clientFor();
    vi.mocked(createWorkspaceUser).mockRejectedValueOnce(new Error(message));
    expect(await provisionEnrollment(client as never, client.row.id)).toMatchObject({ status: "failed", failedStep: "google" });
    expect(client.row.enrollment_status).toBe("needs_attention");
    expect(client.row).not.toHaveProperty("capacity_wait_started_at");
  });

  it("does not process a released or already recovered enrollment from a stale queue selection", async () => {
    const client = clientFor();
    Object.assign(client.row, { enrollment_status: "waiting_google_capacity", capacity_wait_started_at: "2026-11-19T00:00:00Z", released_at: "2026-11-19T01:00:00Z" });
    await provisionEnrollment(client as never, client.row.id, { capacityRetry: true });
    expect(createWorkspaceUser).not.toHaveBeenCalled();
    expect(getWorkspaceUser).not.toHaveBeenCalled();
    expect(provisionPortalAccount).not.toHaveBeenCalled();
  });
});
