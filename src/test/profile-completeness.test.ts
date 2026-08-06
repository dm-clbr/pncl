import { describe, expect, it } from "vitest";
import { getProfileCompletenessGaps, getProfileCompletenessQueue } from "@/lib/profile-completeness";
import type { AgentSummary } from "@/lib/admin-api";

const agent = (overrides: Partial<AgentSummary> = {}): AgentSummary => ({
  id: "agent-1", email: "agent@thepncl.com", name: "Agent One", role: "agent",
  compLevel: 100, npn: "123456", agentNumber: 42, phase: "on_board",
  referrerId: null, referrerName: null, uplineNetwork: null, status: "ready",
  emailConfirmed: true, genesisAccountCreatedAt: null, genesisAccountSkippedAt: null,
  onboardingCompletedAt: null, onboarding: null, hasOnboardingRecord: false, onboardingId: null,
  personalEmail: null, gmailVerificationEmailSentAt: null, googleWorkspaceStatus: null,
  googleSuspensionReason: null, createdAt: "2026-01-01T00:00:00.000Z", source: null,
  profilePhotoPath: "/photo.jpg", profileUpdatedAt: null, partnerUserId: null,
  ...overrides,
});

describe("profile completeness", () => {
  it("reports only operational labels and never sensitive field values", () => {
    const gaps = getProfileCompletenessGaps(agent({
      emailConfirmed: false, agentNumber: null, compLevel: null, profilePhotoPath: null,
      hasOnboardingRecord: true, googleWorkspaceStatus: "not_found", npn: null,
      onboarding: { legalName: "Private Name", firstName: "Private", lastName: "Name", phoneNumber: "5555555555", dateOfBirth: "2000-01-01", ssn: "123-45-6789", stateOfResidence: "CO", uplineNetwork: "", hasLicense: "Yes", npn: null, hasEoInsurance: "No", hasOtherImo: "No", workspaceEmail: "agent@thepncl.com" },
    }));
    expect(gaps.map((entry) => entry.key)).toEqual([
      "email_confirmation", "agent_id", "compensation_tier", "license_npn", "workspace_account", "profile_photo",
    ]);
    expect(JSON.stringify(gaps)).not.toMatch(/555|123-45|Private Name/);
  });

  it("prioritizes the records with the most gaps and omits complete records", () => {
    const enrolled = {
      legalName: "Agent", firstName: "Agent", lastName: "One", phoneNumber: "", dateOfBirth: "", ssn: null,
      stateOfResidence: "", uplineNetwork: "", hasLicense: "No", npn: null, hasEoInsurance: "", hasOtherImo: null, workspaceEmail: null,
    };
    const queue = getProfileCompletenessQueue([
      agent({ id: "complete", name: "Complete", profilePhotoPath: "/photo.jpg", hasOnboardingRecord: true, onboarding: enrolled, googleWorkspaceStatus: "active" }),
      agent({ id: "one", name: "One", profilePhotoPath: null }),
      agent({ id: "two", name: "Two", agentNumber: null, profilePhotoPath: null }),
    ]);
    expect(queue.map((entry) => entry.agent.id)).toEqual(["two", "one"]);
  });
});
