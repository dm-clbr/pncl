import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PortalLeadSpplyOpen from "@/pages/PortalLeadSpplyOpen";
import { launchChallenge, LEADSPPLY_START, portalLeadSpplyHref } from "@/lib/portal-leadspply-sso";
const api = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ id: "hub-1", email: "agent@thepncl.com", confirmed: true, sessionId: "hub-1", token: "hub-token" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: auth.id, email: auth.email, email_confirmed_at: auth.confirmed ? "2026-10-27" : null }, session: { access_token: auth.token, user: { id: auth.sessionId } } }) }));
vi.mock("@/lib/portal-leadspply-sso", async original => ({ ...await original<typeof import("@/lib/portal-leadspply-sso")>(), requestLeadSpplyLink: api, redirectToLeadSpply: redirect }));
vi.mock("@/components/portal/PortalToolLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const challenge = "a".repeat(64);
const view = (search = "?challenge=" + challenge) => render(<StrictMode><MemoryRouter initialEntries={["/portal/leadspply/open" + search]}><PortalLeadSpplyOpen /></MemoryRouter></StrictMode>);
beforeEach(() => { api.mockResolvedValue({ url: LEADSPPLY_START + "#token=" + "a".repeat(43) }); });
afterEach(() => { vi.resetAllMocks(); Object.assign(auth, { id: "hub-1", email: "agent@thepncl.com", confirmed: true, sessionId: "hub-1", token: "hub-token" }); });
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
  await screen.findByText(/Finish your LeadSpply verification/);
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
