import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import OnboardingSuccess from "@/pages/OnboardingSuccess";
import type { OnboardingStatusResponse } from "@/lib/onboarding-api";

const getOnboardingStatus = vi.fn<() => Promise<OnboardingStatusResponse>>();

vi.mock("@/lib/onboarding-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/onboarding-api")>()),
  getOnboardingStatus: (...args: unknown[]) =>
    (getOnboardingStatus as (...a: unknown[]) => Promise<OnboardingStatusResponse>)(...args),
  revealOnboardingCredentials: vi.fn(),
  resendPortalInvite: vi.fn(),
  retryOnboardingEnrollment: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
// WebGL2 has no jsdom implementation; the backdrop is decorative either way.
vi.mock("@/components/ui/liquid-gradient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/liquid-gradient")>()),
  default: () => null,
}));

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/onboarding/:onboardingId/success" element={<OnboardingSuccess />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OnboardingSuccess", () => {
  it("renders the invalid-link state when the token is missing", () => {
    renderAt("/onboarding/ob-1/success");

    expect(
      screen.getByRole("heading", { name: "This onboarding link is incomplete." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Invalid Link")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Onboarding" })).toBeInTheDocument();
  });

  it("renders the failed state with the retry action", async () => {
    getOnboardingStatus.mockResolvedValue({
      status: "failed",
      email: "new.agent@thepncl.com",
      message: "Workspace account creation did not finish.",
      failedStep: "create_workspace_user",
      retryable: true,
    } as OnboardingStatusResponse);

    renderAt("/onboarding/ob-1/success?token=t");

    expect(
      await screen.findByRole("heading", { name: "We couldn't finish creating your PNCL email." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Setup Failed")).toBeInTheDocument();
    expect(screen.getByText("Workspace account creation did not finish.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry saved enrollment" })).toBeInTheDocument();
  });

  it("renders the expired state", async () => {
    getOnboardingStatus.mockResolvedValue({
      status: "expired",
      email: "new.agent@thepncl.com",
    } as OnboardingStatusResponse);

    renderAt("/onboarding/ob-1/success?token=t");

    expect(
      await screen.findByRole("heading", { name: "This sign-in link has expired." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Link Expired")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact Support" })).toBeInTheDocument();
  });
});
