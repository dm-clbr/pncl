import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PortalLeadSpplyOpen from "@/pages/PortalLeadSpplyOpen";
import { launchChallenge, LEADSPPLY_START, portalLeadSpplyHref } from "@/lib/portal-leadspply-sso";
const api = vi.hoisted(() => vi.fn());
const statusApi = vi.hoisted(() => vi.fn());
const google = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ id: "hub-1", email: "agent@thepncl.com", confirmed: true, sessionId: "hub-1", token: "hub-token" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ signInWithGoogle: google, user: { id: auth.id, email: auth.email, email_confirmed_at: auth.confirmed ? "2026-10-27" : null }, session: { access_token: auth.token, user: { id: auth.sessionId } } }) }));
vi.mock("@/lib/portal-leadspply-sso", async original => ({ ...await original<typeof import("@/lib/portal-leadspply-sso")>(), requestLeadSpplyLink: api, redirectToLeadSpply: redirect }));
vi.mock("@/lib/hub-account-setup", () => ({ hubAccountSetup: statusApi }));
vi.mock("@/components/portal/PortalToolLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const challenge = "a".repeat(64);
const view = (search = "?challenge=" + challenge) => render(<StrictMode><MemoryRouter initialEntries={["/portal/leadspply/open" + search]}><PortalLeadSpplyOpen /></MemoryRouter></StrictMode>);
const ready = { state: "connected", email: "agent@thepncl.com", account: { id: "ls-1", email: "agent@thepncl.com" }, ownershipVerified: true, proofExpiresAt: null, emailMatches: true, approved: true, ready: true, payEnabled: true };
beforeEach(() => { statusApi.mockImplementation(async () => ({ ...ready, email: auth.email })); api.mockResolvedValue({ url: LEADSPPLY_START + "#token=" + "a".repeat(43) }); });
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); Object.assign(auth, { id: "hub-1", email: "agent@thepncl.com", confirmed: true, sessionId: "hub-1", token: "hub-token" }); });
it("starts the browser check without issuing an unbound handoff", async () => {
  view(""); await waitFor(() => expect(redirect).toHaveBeenCalledExactlyOnceWith(LEADSPPLY_START));
  expect(api).not.toHaveBeenCalled();
});
it("requests exactly one signed handoff after the browser round trip", async () => {
  view(); await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
  expect(api).toHaveBeenCalledExactlyOnceWith("hub-token", challenge, expect.any(AbortSignal));
});
it.each(["unconfirmed", "wrong-domain", "stale-session"])("stops %s before requesting a link", async reason => {
  if (reason === "unconfirmed") auth.confirmed = false;
  if (reason === "wrong-domain") auth.email = "agent@example.com";
  if (reason === "stale-session") auth.sessionId = "different";
  view(); await act(async () => {}); expect(api).not.toHaveBeenCalled(); expect(redirect).not.toHaveBeenCalled();
});
it("ignores a late response after Hub identity changes", async () => {
  let resolve!: (value: unknown) => void;
  api.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const v = view(); await waitFor(() => expect(api).toHaveBeenCalledOnce());
  const signal = api.mock.calls[0][2];
  Object.assign(auth, { id: "hub-2", sessionId: "hub-2", email: "other@thepncl.com" });
  api.mockRejectedValue({ code: "setup_incomplete" });
  v.rerender(<StrictMode><MemoryRouter><PortalLeadSpplyOpen /></MemoryRouter></StrictMode>);
  await screen.findByText(/Finish your LeadSpply account verification/);
  await act(async () => resolve({ url: LEADSPPLY_START + "#token=" + "a".repeat(43) }));
  expect(signal.aborted).toBe(true); expect(redirect).not.toHaveBeenCalled();
});
it("does not restart on a token refresh or automatically retry a failure", async () => {
  api.mockRejectedValue({ code: "rate_limited" }); const v = view();
  await screen.findByText(/Too many sign-in attempts/);
  auth.token = "refreshed";
  v.rerender(<StrictMode><MemoryRouter><PortalLeadSpplyOpen /></MemoryRouter></StrictMode>);
  await act(async () => {}); expect(api).toHaveBeenCalledOnce();
});
it.each([{ code: "sso_timeout" }, { name: "AbortError" }])("offers a manual retry for a slow request without calling it an eligibility failure", async error => {
  api.mockRejectedValue(error);
  view();
  await screen.findByText(/LeadSpply took too long to respond/);
  expect(screen.queryByText(/not available for your account/)).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledOnce();
  expect(redirect).not.toHaveBeenCalled();
});
it("rewrites only known LeadSpply entry points and rejects injected launch parameters", () => {
  expect(portalLeadSpplyHref("https://leadspply.com/dashboard")).toBe("/portal/leadspply/open");
  for (const value of ["https://leadspply.com/admin", "https://leadspply.com.evil.test", "https://leadspply.com/?next=evil", "/portal/leadspply"]) expect(portalLeadSpplyHref(value)).toBe(value);
  for (const search of ["?challenge="+challenge+"&email=other", "?challenge="+challenge+"&challenge="+challenge, "?challenge=bad"]) expect(() => launchChallenge(search)).toThrow();
});

it("shows the actual missing setup steps without another sign-in attempt", async () => {
  api.mockRejectedValue({ code: "setup_incomplete" });
  statusApi.mockResolvedValueOnce(ready).mockResolvedValue({ state: "connected", ownershipVerified: false, emailMatches: false, approved: true, ready: false });
  view();
  await screen.findByText(/verify ownership with your existing LeadSpply login; match your LeadSpply login email/);
  expect(screen.getByRole("link", { name: "Account setup" })).toHaveAttribute("href", "/portal/leadspply?continue=leadspply");
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(statusApi).toHaveBeenLastCalledWith("hub-token", { action: "status" }, expect.any(AbortSignal));
  expect(api).toHaveBeenCalledOnce(); expect(redirect).not.toHaveBeenCalled();
});

it("keeps the initial explanation if the diagnostic request fails", async () => {
  statusApi.mockResolvedValueOnce(ready).mockRejectedValue(new Error("Unavailable"));
  api.mockRejectedValue({ code: "setup_incomplete" });
  view();
  await screen.findByRole("alert");
  await waitFor(() => expect(statusApi).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("alert")).toHaveTextContent(/Finish your LeadSpply account verification/);
  expect(screen.queryByText("Unavailable")).toBeNull();
});

it("shows slow progress, ends a stalled request, and discards a late link", async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  api.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  view(); await act(async () => {});
  expect(screen.getByRole("status")).toHaveTextContent(/Checking your LeadSpply account connection/);
  expect(screen.getByText("agent@thepncl.com")).toBeInTheDocument();
  await act(async () => vi.advanceTimersByTime(8000));
  expect(screen.getByRole("status")).toHaveTextContent(/taking longer than usual/);
  await act(async () => vi.advanceTimersByTime(37000));
  expect(screen.getByRole("alert")).toHaveTextContent(/took too long/);
  expect(api.mock.calls[0][2].aborted).toBe(true);
  await act(async () => resolve({ url: LEADSPPLY_START + "#token=" + "a".repeat(43) }));
  expect(redirect).not.toHaveBeenCalled();
});

it("bounds session checking and starts Google sign-in on an explicit click", async () => {
  vi.useFakeTimers(); auth.sessionId = "other";
  view(); await act(async () => vi.advanceTimersByTime(12000));
  expect(screen.getByRole("alert")).toHaveTextContent(/could not confirm your current session/);
  fireEvent.click(screen.getByRole("button", { name: "Sign in to Hub again" }));
  await act(async () => {});
  expect(google).toHaveBeenCalledExactlyOnceWith("/portal/leadspply/open");
  expect(api).not.toHaveBeenCalled();
});

it("honors throttling and retries with the refreshed Hub token", async () => {
  vi.useFakeTimers();
  api.mockRejectedValueOnce({ code: "rate_limited", retryAfter: 15 });
  const v = view(); await act(async () => {});
  expect(screen.getByRole("button", { name: "Try again in 15 seconds" })).toBeDisabled();
  auth.token = "refreshed";
  v.rerender(<StrictMode><MemoryRouter><PortalLeadSpplyOpen /></MemoryRouter></StrictMode>);
  await act(async () => vi.advanceTimersByTime(15000));
  expect(api).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await act(async () => {});
  expect(api).toHaveBeenLastCalledWith("refreshed", challenge, expect.any(AbortSignal));
  expect(redirect).toHaveBeenCalledOnce();
});

it("does not expose provider details and gives work-email failures a support path", async () => {
  api.mockRejectedValue(Object.assign(new Error("private-key-and-token"), { code: "work_email_review_required" }));
  view();
  await screen.findByText(/Admin accounts do not need agent onboarding/);
  expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/portal/support");
  expect(document.body.textContent).not.toContain("private-key-and-token");
});

it.each([
  [{ state: "not_linked" }, /not linked to LeadSpply yet/],
  [{ state: "account_unavailable" }, /Contact support to review account access/],
  [{ state: "connected", ownershipVerified: true, emailMatches: true, approved: true, ready: true }, /Finish your LeadSpply account verification/],
])("explains the diagnostic status without assuming ownership", async (status, message) => {
  api.mockRejectedValue({ code: "setup_incomplete" }); statusApi.mockResolvedValueOnce(ready).mockResolvedValue(status);
  view(); await screen.findByText(message as RegExp);
  expect(api).toHaveBeenCalledOnce(); expect(redirect).not.toHaveBeenCalled();
});

it("explains unconfirmed LeadSpply email instead of generic account review", async () => {
  api.mockRejectedValue({ code: "setup_incomplete" });
  statusApi.mockResolvedValueOnce(ready).mockResolvedValue({ state: "account_unavailable", blockedReason: "email_confirmation_required" });
  view(); await screen.findByText(/Your LeadSpply email has not been confirmed/);
  expect(redirect).not.toHaveBeenCalled();
  expect(screen.queryByText(/Admin accounts do not need/)).toBeNull();
});

it("explains the pending invitation before asking for account ownership", async () => {
  api.mockRejectedValue({ code: "setup_incomplete" });
  statusApi.mockResolvedValueOnce(ready).mockResolvedValue({ state: "account_unavailable", blockedReason: "invitation_pending" });
  view(); await screen.findByText(/Your LeadSpply invitation has not been accepted/);
  expect(redirect).not.toHaveBeenCalled();
});
