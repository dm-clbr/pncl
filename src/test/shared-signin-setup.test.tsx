import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PortalLeadSpplyOpen from "@/pages/PortalLeadSpplyOpen";
import PortalLeadSpply from "@/pages/PortalLeadSpply";
import PortalPay from "@/pages/PortalPay";
import type { SetupStatus } from "@/lib/hub-account-setup";

const api = vi.hoisted(() => vi.fn());
const issue = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "hub-1", email: "agent@thepncl.com", email_confirmed_at: "2026-11-01" },
  session: { access_token: "hub-token", user: { id: "hub-1" } },
}) }));
vi.mock("@/lib/hub-account-setup", async original => ({ ...await original<typeof import("@/lib/hub-account-setup")>(), hubAccountSetup: api }));
vi.mock("@/lib/portal-leadspply-sso", async original => ({ ...await original<typeof import("@/lib/portal-leadspply-sso")>(), requestLeadSpplyLink: issue, redirectToLeadSpply: redirect }));
vi.mock("@/lib/portal-pay", async original => ({ ...await original<typeof import("@/lib/portal-pay")>(), redirectToPay: redirect }));
vi.mock("@/components/portal/PortalToolLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const ready: SetupStatus = { state: "connected", email: "agent@thepncl.com", account: { id: "ls-1", email: "agent@thepncl.com" }, ownershipVerified: true, proofExpiresAt: null, emailMatches: true, approved: true, ready: true, payEnabled: true };
const unlinked: SetupStatus = { ...ready, state: "not_linked", account: null, ownershipVerified: false, emailMatches: false, approved: false, ready: false };
const mismatch: SetupStatus = { ...ready, account: { id: "ls-1", email: "old@example.com" }, emailMatches: false, ownershipVerified: false, ready: false };
const payLink = () => ({ url: "https://www.pnclpay.com/api/auth/partner/redeem?token=test", expiresAt: new Date(Date.now() + 120000).toISOString() });
const view = (product = "LeadSpply", challenge = false) => render(<StrictMode><MemoryRouter initialEntries={[product === "PNCL Pay" ? "/portal/pay" : "/portal/leadspply/open" + (challenge ? "?challenge=" + "a".repeat(64) : "")]}><Routes>
  <Route path="/portal/leadspply/open" element={<PortalLeadSpplyOpen />} />
  <Route path="/portal/leadspply" element={<PortalLeadSpply />} />
  <Route path="/portal/pay" element={<PortalPay />} />
</Routes></MemoryRouter></StrictMode>);
beforeEach(() => {
  vi.stubEnv("VITE_PNCL_HUB_SETUP_ENABLED", "true");
  api.mockResolvedValue(unlinked);
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

it.each(["LeadSpply", "PNCL Pay"])("checks setup and shows steps before opening %s", async product => {
  view(product);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Link your existing LeadSpply account/)).toBeInTheDocument();
  expect(within(dialog).getByRole("link", { name: "Start account setup" })).toHaveAttribute("href", `/portal/leadspply?continue=${product === "PNCL Pay" ? "pay" : "leadspply"}`);
  expect(api).toHaveBeenCalledExactlyOnceWith("hub-token", { action: "status" }, expect.any(AbortSignal));
  expect(issue).not.toHaveBeenCalled(); expect(redirect).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Close", exact: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View setup steps" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(api).toHaveBeenCalledOnce();
});

it("does not issue a challenge-bound LeadSpply link while setup is incomplete", async () => {
  view("LeadSpply", true);
  await screen.findByRole("dialog");
  expect(issue).not.toHaveBeenCalled(); expect(redirect).not.toHaveBeenCalled();
});

it.each(["LeadSpply", "PNCL Pay"])("refreshes setup and opens %s without a password proof when the emails match", async product => {
  view(product);
  const dialog = await screen.findByRole("dialog");
  api.mockImplementation(async (_token, body) => body.action === "status" ? ready : payLink());
  fireEvent.click(within(dialog).getByRole("button", { name: "Refresh connection" }));
  await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.mock.calls.some(c => ["verify", "update_email"].includes(c[1].action))).toBe(false);
});

it.each(["LeadSpply", "PNCL Pay"])("guides a mismatched email through verification and consent before continuing to %s", async product => {
  let status = mismatch;
  api.mockImplementation(async (_token, body) => {
    if (body.action === "verify") status = { ...mismatch, ownershipVerified: true, proofExpiresAt: new Date(Date.now() + 600000).toISOString() };
    if (body.action === "update_email") status = ready;
    return body.action === "pay" ? payLink() : status;
  });
  view(product);
  let dialog = await screen.findByRole("dialog", { name: "Match your LeadSpply email" });
  expect(within(dialog).getByText("old@example.com")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("link", { name: "Update LeadSpply email" }));
  dialog = await screen.findByRole("dialog", { name: "Use your PNCL Hub email" });
  expect(api.mock.calls.every(c => c[1].action === "status")).toBe(true);
  fireEvent.click(within(dialog).getByRole("button", { name: "Verify to update email" }));
  expect(screen.getByLabelText(/Current LeadSpply email/)).toHaveValue("old@example.com");
  fireEvent.change(screen.getByLabelText(/LeadSpply password/), { target: { value: "fixture-only" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify account", exact: true }));
  const update = await screen.findByRole("button", { name: "Update to my Hub email" });
  expect(api.mock.calls.some(c => c[1].action === "update_email")).toBe(false);
  expect(screen.queryByDisplayValue("fixture-only")).toBeNull();
  expect(redirect).not.toHaveBeenCalled();
  fireEvent.click(update);
  const next = await screen.findByRole("link", { name: `Continue to ${product}` });
  expect(api).toHaveBeenLastCalledWith("hub-token", { action: "update_email", expectedEmail: ready.email }, expect.any(AbortSignal));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(next);
  await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
});

it.each([
  [{ ...unlinked, state: "account_unavailable", blockedReason: "invitation_pending" }, /Open your LeadSpply invitation email/],
  [{ ...unlinked, state: "account_unavailable", blockedReason: "email_confirmation_required" }, /Resend confirmation email/],
  [{ ...ready, approved: false, ready: false }, /Contact support for the required LeadSpply account approval/],
  [{ ...ready, payEnabled: false }, /Bill creates Pay accounts separately/],
])("explains the actual remaining requirement before requesting a Pay link", async (status, message) => {
  api.mockResolvedValue(status); view("PNCL Pay");
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(message as RegExp)).toBeInTheDocument();
  expect(api.mock.calls.every(c => c[1].action === "status")).toBe(true);
  expect(redirect).not.toHaveBeenCalled();
});

it("shows Pay provisioning steps when Pay reports that its separate account is missing", async () => {
  api.mockImplementation(async (_token, body) => {
    if (body.action === "status") return ready;
    throw { code: "pay_user_not_found", status: 409 };
  });
  view("PNCL Pay");
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Bill creates Pay accounts separately/)).toBeInTheDocument();
  expect(redirect).not.toHaveBeenCalled();
});

it("fails closed if the setup lookup fails or returns a different Hub identity", async () => {
  api.mockRejectedValueOnce(new Error("private-provider-detail")).mockResolvedValue({ ...ready, email: "other@thepncl.com" });
  view();
  await screen.findByRole("alert");
  expect(document.body.textContent).not.toContain("private-provider-detail");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  await act(async () => {});
  expect(redirect).not.toHaveBeenCalled(); expect(issue).not.toHaveBeenCalled();
});
