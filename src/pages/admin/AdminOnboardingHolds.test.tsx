import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminOnboardingHolds from "./AdminOnboardingHolds";
import { createEnrollmentResumeLink, listOnboardingHolds, type OnboardingHold } from "@/lib/admin-api";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { access_token: "test-admin-session" } }) }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("@/lib/admin-api", () => ({ createEnrollmentResumeLink: vi.fn(), listOnboardingHolds: vi.fn(), releaseOnboardingHold: vi.fn(), retryOnboardingEnrollment: vi.fn(), reconcileOnboardingLink: vi.fn() }));
const hold = {
  onboardingId: "enrollment-1", legalName: "Example Agent", phoneNumber: "8015550101", workspaceEmail: "agent@example.com",
  enrollmentStatus: "awaiting_google_sign_in", referralStatus: "none", contractStatus: "finalized", applicationStatus: "finalized",
  googleAccountStatus: "ready", portalAccountStatus: "ready", finalizationStatus: "ready", releasedAt: null,
  hasGoogleAccount: true, hasPortalAccount: true,
} as OnboardingHold;
const resumeUrl = "https://example.com/onboarding/success/enrollment-1?token=test-token";
const writeText = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listOnboardingHolds).mockResolvedValue([hold]);
  vi.mocked(createEnrollmentResumeLink).mockResolvedValue({ resumeUrl, expiresAt: "2026-11-20T22:00:00Z", message: "Link ready" });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});
afterEach(cleanup);

it("keeps the correct named link available when clipboard access is denied", async () => {
  writeText.mockRejectedValue(new Error("NotAllowedError"));
  render(<MemoryRouter><AdminOnboardingHolds /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Copy resume" }));
  expect(await screen.findByRole("region", { name: "Resume link for Example Agent" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Resume link" })).toHaveValue(resumeUrl);
  expect(createEnrollmentResumeLink).toHaveBeenCalledWith("test-admin-session", "enrollment-1");
  await waitFor(() => expect(screen.getByRole("button", { name: "Copy resume" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Copy resume" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("textbox", { name: "Resume link" })).toHaveValue(resumeUrl);
  await waitFor(() => expect(screen.getByRole("button", { name: "Search", exact: true })).toBeEnabled());
  fireEvent.change(screen.getByRole("searchbox", { name: "Search enrollments" }), { target: { value: "Another agent" } });
  fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
  expect(screen.queryByRole("textbox", { name: "Resume link" })).not.toBeInTheDocument();
});

it("does not offer resume links for released duplicates", async () => {
  vi.mocked(listOnboardingHolds).mockResolvedValue([{ ...hold, releasedAt: "2026-11-18T22:00:00Z" }]);
  render(<MemoryRouter><AdminOnboardingHolds /></MemoryRouter>);
  await screen.findByText("Example Agent");
  expect(screen.queryByRole("button", { name: "Copy resume" })).not.toBeInTheDocument();
});


it("does not block enrollment actions while clipboard permission remains pending", async () => {
  writeText.mockReturnValue(new Promise(() => {}));
  render(<MemoryRouter><AdminOnboardingHolds /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Copy resume" }));
  expect(await screen.findByRole("textbox", { name: "Resume link" })).toHaveValue(resumeUrl);
  await waitFor(() => expect(screen.getByRole("button", { name: "Copy resume" })).toBeEnabled());
});
