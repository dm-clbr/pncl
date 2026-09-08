import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminCompLevelSelect } from "@/components/admin/AdminCompLevelSelect";
import type { AgentSummary } from "@/lib/admin-api";

const agent = (overrides: Partial<AgentSummary> = {}): AgentSummary => ({
  id: "agent-1",
  email: "agent@thepncl.com",
  name: "Agent One",
  role: "agent",
  compLevel: 85,
  npn: null,
  agentNumber: null,
  phase: "on_board",
  referrerId: "upline-1",
  referrerName: "Upline One",
  uplineNetwork: null,
  status: "ready",
  emailConfirmed: true,
  genesisAccountCreatedAt: null,
  genesisAccountSkippedAt: null,
  onboardingCompletedAt: null,
  onboarding: null,
  hasOnboardingRecord: true,
  onboardingId: null,
  personalEmail: null,
  gmailVerificationEmailSentAt: null,
  googleWorkspaceStatus: null,
  googleSuspensionReason: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  source: null,
  profilePhotoPath: null,
  profileUpdatedAt: null,
  partnerUserId: null,
  ...overrides,
});

describe("AdminCompLevelSelect", () => {
  it("shows the selected level only once and labels the clear option", () => {
    const selectedAgent = agent();
    const upline = agent({ id: "upline-1", name: "Upline One", compLevel: 135, referrerId: null });
    const onChange = vi.fn();

    render(
      <AdminCompLevelSelect
        agent={selectedAgent}
        agentsById={new Map([[upline.id, upline]])}
        onChange={onChange}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Update comp level for Agent One" });
    expect(select).toHaveValue("85");
    expect(screen.getAllByRole("option", { name: "85" })).toHaveLength(1);
    expect(screen.getByRole("option", { name: "Not set" })).toHaveValue("");

    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
