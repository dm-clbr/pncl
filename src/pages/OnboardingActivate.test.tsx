import { StrictMode, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import OnboardingActivate from "./OnboardingActivate";
import PortalLogin from "./PortalLogin";

const { getSession, refreshSession } = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }));
vi.mock("@/contexts/AuthContext", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/contexts/AuthContext")>(),
  useAuth: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseAuthConfigured: () => true,
  getSupabaseConfig: () => ({ url: "https://pncl.example", anonKey: "test-anon-key" }),
  getSupabaseClient: () => ({ auth: { getSession, refreshSession } }),
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/components/portal/PortalAuthLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

const pendingUser = {
  id: "new-agent",
  email: "agent@thepncl.com",
  email_confirmed_at: "2026-10-15T12:00:00Z",
  app_metadata: { enrollment_version: 3, enrollment_ready: false },
} as User;
const readyUser = { ...pendingUser, app_metadata: { ...pendingUser.app_metadata, enrollment_ready: true } };
const pendingSession = { access_token: "google-session-token", user: pendingUser } as Session;
let auth: ReturnType<typeof useAuth>;
let fetchMock: ReturnType<typeof vi.fn>;

function routes(path = "/onboarding/activate") {
  return <StrictMode>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/onboarding/activate" element={<OnboardingActivate />} />
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route path="/portal" element={<h1>Portal dashboard</h1>} />
      </Routes>
    </MemoryRouter>
  </StrictMode>;
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  auth = { user: pendingUser, session: pendingSession, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() };
  vi.mocked(useAuth).mockImplementation(() => auth);
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ activated: true }) });
  vi.stubGlobal("fetch", fetchMock);
  getSession.mockImplementation(async () => ({ data: { session: auth.session }, error: null }));
  refreshSession.mockResolvedValue({ data: { session: { ...pendingSession, user: readyUser } }, error: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("automatic portal activation", () => {
  it("verifies a pending Google sign-in automatically and opens the portal after the session is refreshed", async () => {
    const view = render(routes("/portal/login"));
    await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://pncl.example/functions/v1/activate-onboarding-google-signin",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer google-session-token" }) }),
    );
    expect(screen.queryByRole("link", { name: "Continue to PNCL sign-in" })).not.toBeInTheDocument();
    expect(screen.queryByText("Portal dashboard")).not.toBeInTheDocument();
    // Supabase's token refresh publishes the updated session to AuthProvider.
    auth = { ...auth, user: readyUser, session: { ...pendingSession, user: readyUser } };
    view.rerender(routes("/portal/login"));
    expect(await screen.findByText("Portal dashboard")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("waits for auth initialization before starting verification", async () => {
    auth = { ...auth, loading: true };
    const view = render(routes());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    auth = { ...auth, loading: false };
    view.rerender(routes());
    await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  });

  it("starts Google sign-in directly for signed-out users without attempting activation", () => {
    auth = { ...auth, user: null, session: null };
    render(routes());
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([readyUser, { ...pendingUser, app_metadata: { enrollment_version: 2 } }])(
    "opens the portal for an already active account without reactivating it",
    async (user) => {
      auth = { ...auth, user, session: { ...pendingSession, user } };
      render(routes());
      expect(await screen.findByText("Portal dashboard")).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("shows a pending Google setup error and retries only when requested, even after a token refresh", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Finish signing in to Gmail and changing your temporary password first." }),
    });
    const view = render(routes());
    expect(await screen.findByRole("alert")).toHaveTextContent("Finish signing in to Gmail");
    expect(refreshSession).not.toHaveBeenCalled();
    auth = { ...auth, session: { ...pendingSession, access_token: "refreshed-token" } };
    view.rerender(routes());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "Continue to PNCL sign-in" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try verification again" }));
    await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer refreshed-token");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    { data: { session: null }, error: new Error("Unable to refresh your session") },
    { data: { session: pendingSession }, error: null },
  ])("does not claim activation succeeded when the refreshed session is unavailable or still pending", async (result) => {
    refreshSession.mockResolvedValue(result);
    render(routes());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Unable to/);
    expect(screen.getByRole("button", { name: "Try verification again" })).toBeEnabled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText("Portal dashboard")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("offers a retry after a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("Network unavailable"));
    render(routes());
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("button", { name: "Try verification again" })).toBeEnabled();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("uses the latest auth token instead of the React session snapshot", async () => {
    getSession.mockResolvedValue({ data: { session: { ...pendingSession, access_token: "latest-token" } }, error: null });
    render(routes());
    await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer latest-token");
  });

  it("refreshes and retries once after a 401, then verifies readiness", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    refreshSession.mockResolvedValueOnce({ data: { session: { ...pendingSession, access_token: "new-token" } }, error: null });
    render(routes());
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer new-token");
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });

  it.each(["revoked", "rejected again", "missing", "expired on load", "different account"])(
    "offers fresh Google OAuth when the session is %s without a login redirect loop", async (scenario) => {
      if (scenario === "missing") {
        getSession.mockResolvedValue({ data: { session: null }, error: null });
      } else if (scenario === "expired on load") {
        getSession.mockResolvedValue({ data: { session: null }, error: { status: 400, message: "Invalid Refresh Token" } });
      } else {
        fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Unauthorized" }) });
        refreshSession.mockResolvedValue(scenario === "revoked"
          ? { data: { session: null }, error: { status: 400, message: "Invalid Refresh Token" } }
          : { data: { session: { ...pendingSession, user: scenario === "different account"
            ? { ...pendingUser, id: "other-agent" } : pendingUser } }, error: null });
      }
      render(routes());
      expect(await screen.findByRole("alert")).toHaveTextContent("Your sign-in session ended");
      expect(screen.queryByRole("button", { name: "Try verification again" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
      expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
      expect(toast.success).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
    },
  );

  it("keeps the Google sign-in action available if starting OAuth fails", async () => {
    auth = { ...auth, user: null, session: null, signInWithGoogle: vi.fn().mockRejectedValue(new Error("Connection unavailable")) };
    render(routes());
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection unavailable");
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
  });

  it("ignores an old request after sign-out and verifies a subsequent sign-in", async () => {
    let resolveRequest: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const view = render(routes());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    auth = { ...auth, user: null, session: null };
    view.rerender(routes());
    await act(async () => resolveRequest({ ok: false, status: 409, json: async () => ({ message: "Old request error" }) }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
    auth = { ...auth, user: pendingUser, session: pendingSession };
    view.rerender(routes());
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
