import { describe, expect, it, vi, beforeEach } from "vitest";
import { provisionEnrollment } from "../../supabase/functions/_shared/enrollmentProvisioning";
import { getWorkspaceUser } from "../../supabase/functions/_shared/googleWorkspace";
import { initializePortalAgentDesignation } from "../../supabase/functions/_shared/portalAgentDesignations";
import { syncOnboardingProfileAssets } from "../../supabase/functions/_shared/portalProfileSetup";
vi.mock("../../supabase/functions/_shared/googleWorkspace", () => ({ getWorkspaceUser: vi.fn(), waitForWorkspaceMailboxReady: vi.fn(), createWorkspaceUser: vi.fn(), updateWorkspaceUserRecovery: vi.fn(), isAutomaticallySuspendedGoogleUser: vi.fn(), GoogleWorkspaceAutoSuspendedError: class extends Error {} }));
vi.mock("../../supabase/functions/_shared/portalAuth", () => ({ provisionPortalAccount: vi.fn().mockResolvedValue("recruit-1"), markPortalEnrollmentReady: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalProfileSetup", () => ({ syncOnboardingProfileAssets: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalReferralInvites", () => ({ attachOnboardingToReferralInvite: vi.fn(), findActiveOnboardingByPhoneNumber: vi.fn(), findActiveOnboardingBySsnHash: vi.fn(), upsertPortalProfileCompLevel: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalAgentDesignations", () => ({ initializePortalAgentDesignation: vi.fn() }));
vi.mock("../../supabase/functions/_shared/security", () => ({ decryptTemporaryPassword: vi.fn().mockResolvedValue("test-password"), encryptTemporaryPassword: vi.fn(), generateTemporaryPassword: vi.fn() }));
vi.mock("../../supabase/functions/_shared/logger", () => ({ logOnboarding: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getWorkspaceUser).mockResolvedValue({ id: "google-1", suspended: false } as never);
  vi.mocked(initializePortalAgentDesignation).mockResolvedValue(undefined);
});
function clientFor(designation?: string) {
  const row = { id: "enrollment-1", legal_name: "Test Recruit", first_name: "Test", last_name: "Recruit", workspace_email: "test@thepncl.com", personal_email: "test@example.com", temporary_password_encrypted: "encrypted", google_user_id: "google-1", supabase_user_id: "recruit-1", referral_invite_id: "invite-1", invited_comp_level: 95, invited_agent_designation: designation, state_of_residence: "UT", enrollment_status: "needs_attention" };
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
    update: (values: Record<string, unknown>) => {
      updates.push(values);
      const query = { eq: () => query, or: () => query, select: () => query, maybeSingle: async () => ({ data: { id: row.id } }), then: (resolve: (value: unknown) => void) => resolve({ error: null }) };
      return query;
    },
  }));
  return { from, updates };
}
describe("Referral designation during enrollment", () => {
  it.each(["ibo", "loa", undefined])("assigns the saved %s designation before enrollment completes", async (designation) => {
    const client = clientFor(designation);
    const result = await provisionEnrollment(client as never, "enrollment-1");
    expect(result.enrollmentStatus).toBe("awaiting_google_sign_in");
    expect(syncOnboardingProfileAssets).toHaveBeenCalled();
    expect(initializePortalAgentDesignation).toHaveBeenCalledWith(client, "recruit-1", designation);
    expect(client.updates).toContainEqual(expect.objectContaining({ finalization_status: "ready" }));
  });
  it("keeps enrollment incomplete when designation cannot be assigned", async () => {
    vi.mocked(initializePortalAgentDesignation).mockRejectedValue(new Error("Designation unavailable"));
    const client = clientFor("ibo");
    const result = await provisionEnrollment(client as never, "enrollment-1");
    expect(result).toMatchObject({ status: "failed", failedStep: "finalization" });
    expect(client.updates).not.toContainEqual(expect.objectContaining({ finalization_status: "ready" }));
  });
});
