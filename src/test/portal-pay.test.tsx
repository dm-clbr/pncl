import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PortalPay from "@/pages/PortalPay";
import { payRedirectUrl, portalPayHref } from "@/lib/portal-pay";

const api = vi.hoisted(() => vi.fn());
const statusApi = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ id: "hub-1", email: "agent@thepncl.com", confirmed: true, sessionId: "hub-1", token: "hub-token" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: auth.id, email: auth.email, email_confirmed_at: auth.confirmed ? "2026-10-27" : null },
  session: { access_token: auth.token, user: { id: auth.sessionId } },
}) }));
vi.mock("@/lib/hub-account-setup", () => ({ hubAccountSetup: (token: string, body: { action: string }, signal: AbortSignal) => (body.action === "status" ? statusApi : api)(token, body, signal) }));
vi.mock("@/lib/portal-pay", async original => ({ ...await original<typeof import("@/lib/portal-pay")>(), redirectToPay: redirect }));
vi.mock("@/components/portal/PortalToolLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const link = () => ({ url: "https://www.pnclpay.com/api/auth/partner/redeem?token=synthetic-test-token", expiresAt: new Date(Date.now() + 120000).toISOString() });
const view = () => render(<StrictMode><MemoryRouter><PortalPay /></MemoryRouter></StrictMode>);
const ready = { state: "connected", email: "agent@thepncl.com", account: { id: "ls-1", email: "agent@thepncl.com" }, ownershipVerified: true, proofExpiresAt: null, emailMatches: true, approved: true, ready: true, payEnabled: true };
beforeEach(() => { statusApi.mockImplementation(async () => ({ ...ready, email: auth.email })); api.mockImplementation(async () => link()); });
afterEach(() => {
  vi.resetAllMocks(); vi.useRealTimers();
  Object.assign(auth, { id: "hub-1", email: "agent@thepncl.com", confirmed: true, sessionId: "hub-1", token: "hub-token" });
});

it("turns the existing Pay shortcut into a single automatic handoff under StrictMode", async () => {
  render(<StrictMode><MemoryRouter initialEntries={["/portal"]}><Routes>
    <Route path="/portal" element={<Link to={portalPayHref("https://pnclpay.com")}>PNCL Pay</Link>} />
    <Route path="/portal/pay" element={<PortalPay />} />
  </Routes></MemoryRouter></StrictMode>);
  expect(api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "PNCL Pay" }));
  await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
  expect(api).toHaveBeenCalledExactlyOnceWith("hub-token", { action: "pay" }, expect.any(AbortSignal));
});

it("only rewrites recognized Pay entry points and leaves policy and unrelated links intact", () => {
  expect(portalPayHref("https://www.pnclpay.com/login")).toBe("/portal/pay");
  for (const href of ["/portal/pay-policy", "https://pnclpay.com.evil.test", "https://pnclpay.com/reports", "https://pnclpay.com/?redirect=other", "https://user:pass@pnclpay.com"]) expect(portalPayHref(href)).toBe(href);
});

it.each(["unconfirmed", "wrong-domain", "stale-session"])("does not issue a link for %s", async reason => {
  if (reason === "unconfirmed") auth.confirmed = false;
  if (reason === "wrong-domain") auth.email = "agent@example.com";
  if (reason === "stale-session") auth.sessionId = "someone-else";
  view();
  await act(async () => {});
  expect(api).not.toHaveBeenCalled(); expect(redirect).not.toHaveBeenCalled();
});

it("discards a late link after the Hub identity changes", async () => {
  let finish: (value: unknown) => void = () => {};
  api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const result = view();
  await waitFor(() => expect(api).toHaveBeenCalledOnce());
  const signal = api.mock.calls[0][2];
  auth.id = "hub-2"; auth.email = "second@thepncl.com"; auth.sessionId = "hub-2";
  api.mockRejectedValue(Object.assign(new Error(), { code: "setup_incomplete" }));
  result.rerender(<StrictMode><MemoryRouter><PortalPay /></MemoryRouter></StrictMode>);
  await screen.findByText(/Finish your LeadSpply/);
  await act(async () => finish(link()));
  expect(signal.aborted).toBe(true); expect(redirect).not.toHaveBeenCalled();
});

it("does not issue another link when the same user's session token refreshes", async () => {
  const result = view();
  await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
  auth.token = "refreshed-token";
  result.rerender(<StrictMode><MemoryRouter><PortalPay /></MemoryRouter></StrictMode>);
  await act(async () => {});
  expect(api).toHaveBeenCalledOnce();
});

it.each([
  ["pay_user_not_found", 409, /created by Bill/],
  ["setup_incomplete", 409, /Finish your LeadSpply/],
  ["pay_unavailable", 503, /not enabled/],
])("stops without retry or sign-in for %s", async (code, status, message) => {
  api.mockRejectedValue(Object.assign(new Error("Sensitive provider detail"), { code, status }));
  view(); await screen.findByText(message as RegExp);
  expect(screen.queryByText(/Sensitive provider/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(screen.getAllByRole("link", { name: "Contact support" })[0]).toHaveAttribute("href", "/portal/support");
  expect(api).toHaveBeenCalledOnce();
  expect(api.mock.calls.filter(call => call[1].action === "pay")).toHaveLength(1);
  expect(redirect).not.toHaveBeenCalled();
});

it("waits out throttling and only retries after a deliberate click", async () => {
  vi.useFakeTimers();
  api.mockRejectedValueOnce(Object.assign(new Error(), { code: "rate_limited", retryAfter: 60 }));
  view(); await act(async () => {});
  expect(screen.getByRole("button", { name: "Try again in 60 seconds" })).toBeDisabled();
  await act(async () => vi.advanceTimersByTime(60000));
  expect(api).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await act(async () => {});
  expect(api).toHaveBeenCalledTimes(2); expect(redirect).toHaveBeenCalledOnce();
});

it("fails closed on an unsafe or expired link without rendering its token", async () => {
  api.mockResolvedValue({ ...link(), url: "https://evil.test/?token=do-not-render" });
  view(); await screen.findByRole("alert");
  expect(redirect).not.toHaveBeenCalled(); expect(document.body.textContent).not.toContain("do-not-render");
  expect(() => payRedirectUrl({ ...link(), expiresAt: new Date(Date.now() - 1000).toISOString() })).toThrow();
  expect(() => payRedirectUrl({ ...link(), url: link().url + "&returnTo=https://evil.test" })).toThrow();
});

it("offers a manual retry after a network failure", async () => {
  api.mockRejectedValueOnce(new TypeError("Network failed"));
  view(); await screen.findByRole("alert");
  expect(api).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
});

it("explains pending approval using the signed-in user's setup status", async () => {
  api.mockRejectedValueOnce({ code: "setup_incomplete" });
  statusApi.mockResolvedValueOnce(ready).mockResolvedValueOnce({ ...ready, approved: false, ready: false });
  view();
  await screen.findByText(/contact support for the required LeadSpply account approval/);
  expect(statusApi).toHaveBeenNthCalledWith(2, "hub-token", { action: "status" }, expect.any(AbortSignal));
  expect(redirect).not.toHaveBeenCalled();
});

it("times out a silent Pay request and never redirects a late response", async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  api.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  view(); await act(async () => {});
  await act(async () => vi.advanceTimersByTime(60000));
  expect(screen.getByRole("alert")).toHaveTextContent(/PNCL Pay took too long/);
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  await act(async () => resolve(link()));
  expect(redirect).not.toHaveBeenCalled();
});
