import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PortalDownlinePanel from "@/components/PortalDownlinePanel";
import type { DownlineMember } from "@/lib/portal-downline";
import { usePortalDownline } from "@/hooks/usePortalDownline";

vi.mock("@/hooks/usePortalDownline", () => ({
  usePortalDownline: vi.fn(),
}));

const MEMBER: DownlineMember = {
  name: "Avery Rivera",
  inviteLabel: "Avery R.",
  invitedCompLevel: 95,
  onboardingStatus: "active",
  portalPhase: "pre_license",
  hasPortalAccount: true,
  joinedAt: "2026-08-24T00:00:00.000Z",
  todoProgress: {
    completedCount: 4,
    totalCount: 9,
    phases: [{ id: "pre_license", label: "Pre-licensing", completedCount: 4, totalCount: 9 }],
  },
};

function mockPanel(state: Partial<ReturnType<typeof usePortalDownline>>) {
  vi.mocked(usePortalDownline).mockReturnValue({
    members: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    ...state,
  } as ReturnType<typeof usePortalDownline>);
}

describe("PortalDownlinePanel", () => {
  it("keeps the loading state as skeleton rows", () => {
    mockPanel({ loading: true });
    const { container } = render(<PortalDownlinePanel embedded />);

    expect(screen.getByText("Loading team...")).toBeInTheDocument();
    expect(container.querySelectorAll(".portal-skeleton.is-row")).toHaveLength(3);
  });

  it("keeps the error state and its retry", () => {
    mockPanel({ error: "boom" });
    render(<PortalDownlinePanel embedded />);

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load team progress/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps the empty state", () => {
    mockPanel({});
    render(<PortalDownlinePanel embedded />);

    expect(screen.getByText("No recruits yet")).toBeInTheDocument();
    expect(screen.getByText(/create a referral link above/i)).toBeInTheDocument();
  });

  it("renders each recruit as one row with a stage chip", () => {
    mockPanel({ members: [MEMBER] });
    const { container } = render(<PortalDownlinePanel embedded />);

    expect(screen.getByRole("heading", { name: "Team progress" })).toBeInTheDocument();
    const row = container.querySelector(".portal-row");
    expect(row).toHaveTextContent("Avery R.");
    expect(row).toHaveTextContent("4 of 9 checklist steps complete");
    // The stage is a chip, not a five-segment bar.
    expect(row?.querySelector(".portal-chip")).toHaveTextContent("Pre-License");
    expect(container.querySelector(".portal-downline-segmented-bar")).toBeNull();
  });
});
