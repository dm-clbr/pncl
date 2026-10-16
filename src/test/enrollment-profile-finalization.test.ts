import { beforeEach, describe, expect, it, vi } from "vitest";
import { provisionEnrollment } from "../../supabase/functions/_shared/enrollmentProvisioning";
import { createWorkspaceUser, getWorkspaceUser } from "../../supabase/functions/_shared/googleWorkspace";
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
          maybeSingle: async () => ({ data: { id: row.id }, error: null }),
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
