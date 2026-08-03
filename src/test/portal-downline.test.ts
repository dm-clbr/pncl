import { describe, expect, it } from "vitest";
import {
  formatDownlineActivationStatus,
  getDownlineProgress,
  type DownlineMember,
} from "@/lib/portal-downline";

const baseMember: DownlineMember = {
  name: "Test Recruit",
  inviteLabel: "Test Recruit",
  invitedCompLevel: 3,
  onboardingStatus: "ready",
  activationStatus: "in_progress",
  portalPhase: null,
  hasPortalAccount: false,
  joinedAt: "2026-08-02T00:00:00.000Z",
  todoProgress: null,
};

describe("downline progress", () => {
  it("uses a clear, generic activation state before portal access exists", () => {
    const progress = getDownlineProgress(baseMember);

    expect(progress.currentLabel).toBe("Activating portal");
    expect(progress.segments[0]).toMatchObject({
      id: "activation",
      state: "current",
      detail: "Activating portal",
    });
  });

  it("uses only generic activation language for referrer progress", () => {
    expect(formatDownlineActivationStatus("needs_support")).toBe("Onboarding needs support");
    expect(formatDownlineActivationStatus("in_progress")).not.toMatch(/Google|Gmail/i);
  });

  it("falls back safely while an older backend response is still deployed", () => {
    const legacyMember = { ...baseMember, activationStatus: undefined };
    expect(getDownlineProgress(legacyMember).currentLabel).toBe("Activating portal");
  });
});
