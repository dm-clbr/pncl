import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalReferralPanel from "@/components/PortalReferralPanel";
import { usePortalReferrals } from "@/hooks/usePortalReferrals";

vi.mock("@/hooks/usePortalReferrals", () => ({
  usePortalReferrals: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("PortalReferralPanel", () => {
  beforeEach(() => {
    vi.mocked(usePortalReferrals).mockReturnValue({
      compLevel: 105,
      compOptions: [100, 95],
      invites: [{
        id: "invite-1",
        compLevel: 95,
        recipientLabel: "Avery",
        status: "pending",
        expiresAt: "2099-01-01T00:00:00.000Z",
        consumedAt: null,
        createdAt: "2026-09-20T00:00:00.000Z",
        link: "https://example.com/onboarding?ref=invite-1",
        referrerUserId: "agent-1",
        sharedFromPartner: false,
      }],
      loading: false,
      creating: false,
      error: null,
      reload: vi.fn(),
      createInvite: vi.fn(),
    });
  });

  it("uses contract language without exposing the agent's own tier in referral copy", () => {
    const { container } = render(
      <MemoryRouter>
        <PortalReferralPanel embedded />
      </MemoryRouter>,
    );

    expect(screen.getByRole("region", { name: "Referral links" })).toBeInTheDocument();
    expect(screen.getByText("Starting contract")).toBeInTheDocument();
    expect(screen.getByText(/95% starting contract/)).toBeInTheDocument();
    expect(screen.queryByText(/105/)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\b(comp|compensation|tier)\b/i);
  });
});
