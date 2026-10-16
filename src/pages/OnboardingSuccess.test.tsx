import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingSuccess from "./OnboardingSuccess";
import { getOnboardingStatus, revealOnboardingCredentials, retryOnboardingEnrollment } from "@/lib/onboarding-api";

vi.mock("@/components/ui/liquid-gradient", async (importOriginal) => ({ ...await importOriginal<typeof import("@/components/ui/liquid-gradient")>(), default: () => null }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("@/lib/onboarding-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/onboarding-api")>(),
  getOnboardingStatus: vi.fn(),
  revealOnboardingCredentials: vi.fn(),
  retryOnboardingEnrollment: vi.fn(),
}));

const status = {
  status: "email_created" as const,
  email: "agent@thepncl.com",
  credentialsAvailable: true,
  credentialsViewed: false,
};
const credentials = {
  email: status.email,
  temporaryPassword: "Example-Test!123",
  mustChangePassword: true,
  gmailUrl: "https://accounts.google.com/AccountChooser?Email=agent%40thepncl.com",
};
const writeText = vi.fn();

function renderHandoff() {
  return render(
    <MemoryRouter initialEntries={["/onboarding/success/enrollment-1?token=test-handoff"]}>
      <Routes><Route path="/onboarding/success/:onboardingId" element={<OnboardingSuccess />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getOnboardingStatus).mockResolvedValue(status);
  vi.mocked(revealOnboardingCredentials).mockResolvedValue(credentials);
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});
afterEach(cleanup);

describe("Gmail onboarding password handoff", () => {
  it("acknowledges the created email when finalization fails and resumes the saved enrollment", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValueOnce({
      status: "failed", email: status.email, failedStep: "finalization", retryable: true,
      steps: { google: "ready", portal: "ready", finalization: "failed" },
      message: "Your progress is saved and it is safe to retry.",
    });
    vi.mocked(retryOnboardingEnrollment).mockResolvedValue({ status: "creating_email", enrollmentStatus: "awaiting_google_sign_in" });
    renderHandoff();
    expect(await screen.findByRole("heading", { name: "Your PNCL email is created. Account setup needs attention." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show My Temporary Gmail Password" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry saved enrollment" }));
    expect(await screen.findByRole("button", { name: "Show My Temporary Gmail Password" })).toBeInTheDocument();
    expect(retryOnboardingEnrollment).toHaveBeenCalledWith("enrollment-1", "test-handoff");
  });

  it.each([undefined, { google: "failed" }])("does not claim email creation succeeded without a ready Google step (%s)", async (steps) => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ status: "failed", steps });
    renderHandoff();
    expect(await screen.findByRole("heading", { name: "We couldn’t finish your PNCL account setup." })).toBeInTheDocument();
    expect(screen.queryByText("Your PNCL email is created. Account setup needs attention.")).not.toBeInTheDocument();
  });

  it("makes the password explicit, reveals it through the secure API, and copies the exact password", async () => {
    renderHandoff();
    const show = await screen.findByRole("button", { name: "Show My Temporary Gmail Password" });
    const card = screen.getByRole("region", { name: "Your temporary Gmail password" });
    expect(within(card).getByText(/We.ve created a temporary password/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open Gmail/ })).not.toBeInTheDocument();
    expect(revealOnboardingCredentials).not.toHaveBeenCalled();
    fireEvent.click(show);
    expect(await within(card).findByText(credentials.temporaryPassword)).toBeInTheDocument();
    expect(revealOnboardingCredentials).toHaveBeenCalledWith("enrollment-1", "test-handoff");
    await waitFor(() => expect(card).toHaveFocus());
    const gmail = screen.getByRole("link", { name: /Open Gmail to Sign In/ });
    expect(gmail).toHaveAttribute("href", credentials.gmailUrl);
    fireEvent.click(within(card).getByRole("button", { name: "Copy Temporary Password" }));
    await screen.findByRole("button", { name: "Password copied — copy again" });
    expect(writeText).toHaveBeenCalledWith(credentials.temporaryPassword);
    expect(screen.getByRole("status")).toHaveTextContent("Copied! Next, open Gmail");
  });

  it("keeps the prominent reveal action available when an agent returns to a previously viewed handoff", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ ...status, credentialsViewed: true });
    renderHandoff();
    fireEvent.click(await screen.findByRole("button", { name: "Show My Temporary Gmail Password" }));
    expect(await screen.findByText(credentials.temporaryPassword)).toBeInTheDocument();
  });

  it("shows a recoverable error in the password card when reveal fails", async () => {
    vi.mocked(revealOnboardingCredentials).mockRejectedValue(new Error("Unable to reveal credentials"));
    renderHandoff();
    fireEvent.click(await screen.findByRole("button", { name: "Show My Temporary Gmail Password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to reveal credentials");
    expect(screen.getByRole("button", { name: "Show My Temporary Gmail Password" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: /Open Gmail/ })).not.toBeInTheDocument();
  });

  it("does not claim a temporary password exists when the API says it is unavailable", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ ...status, credentialsAvailable: false });
    renderHandoff();
    expect(await screen.findByText("The temporary password is no longer available from this link.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show My Temporary/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact Support" })).toHaveAttribute("href", "/contact");
  });

  it("does not report a successful copy when clipboard access fails", async () => {
    writeText.mockRejectedValue(new Error("Clipboard unavailable"));
    renderHandoff();
    fireEvent.click(await screen.findByRole("button", { name: "Show My Temporary Gmail Password" }));
    const copy = await screen.findByRole("button", { name: "Copy Temporary Password" });
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(copy).toHaveTextContent("Copy Temporary Password");
    expect(screen.getByRole("status")).toHaveTextContent("Copy this password");
  });
});
