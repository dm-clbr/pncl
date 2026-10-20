import type { Session } from "@supabase/supabase-js";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

const { getSession, signOut, signInWithOAuth, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(), signOut: vi.fn(), signInWithOAuth: vi.fn(), onAuthStateChange: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseAuthConfigured: () => true,
  getSupabaseClient: () => ({ auth: { getSession, signOut, signInWithOAuth, onAuthStateChange } }),
}));
vi.mock("@/components/portal/PortalLoading", () => ({ default: () => <p>Loading</p> }));
vi.mock("@/pages/PortalConfirmEmail", () => ({ default: () => <p>Confirm email</p> }));

const pendingSession = {
  access_token: "new-google-token",
  user: {
    id: "new-agent", email: "agent@thepncl.com", email_confirmed_at: "2026-10-20T20:00:00Z",
    app_metadata: { enrollment_version: 3, enrollment_ready: false },
  },
} as Session;
let listener: (event: string, session: Session | null) => Promise<void>;

function SessionStatus() {
  const { user, loading } = useAuth();
  return <p>{loading ? "Loading" : user?.email ?? "Signed out"}</p>;
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  signOut.mockResolvedValue({ error: null });
  onAuthStateChange.mockImplementation((callback) => {
    listener = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});
afterEach(cleanup);

describe("pending enrollment sessions across tabs", () => {
  it.each(["/onboarding", "/onboarding/success/enrollment-id", "/contact", "/portal/profile"])(
    "preserves a Google sign-in broadcast received by an existing tab on %s", async (path) => {
      window.history.replaceState({}, "", path);
      render(<AuthProvider><SessionStatus /></AuthProvider>);
      await screen.findByText("Signed out");
      await act(() => listener("SIGNED_IN", pendingSession));
      expect(screen.getByText("agent@thepncl.com")).toBeInTheDocument();
      await act(() => listener("TOKEN_REFRESHED", { ...pendingSession, access_token: "refreshed" }));
      expect(signOut).not.toHaveBeenCalled();
      expect(screen.getByText("agent@thepncl.com")).toBeInTheDocument();
    },
  );

  it("preserves a pending session when the Gmail setup tab reloads", async () => {
    window.history.replaceState({}, "", "/onboarding/success/enrollment-id");
    getSession.mockResolvedValue({ data: { session: pendingSession }, error: null });
    render(<AuthProvider><SessionStatus /></AuthProvider>);
    await screen.findByText("agent@thepncl.com");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("routes pending users to activation without rendering protected content or signing them out", async () => {
    window.history.replaceState({}, "", "/portal/profile");
    getSession.mockResolvedValue({ data: { session: pendingSession }, error: null });
    render(<BrowserRouter><AuthProvider><Routes>
      <Route path="/portal/profile" element={<ProtectedRoute><p>Protected profile</p></ProtectedRoute>} />
      <Route path="/onboarding/activate" element={<SessionStatus />} />
    </Routes></AuthProvider></BrowserRouter>);
    await screen.findByText("agent@thepncl.com");
    expect(window.location.pathname).toBe("/onboarding/activate");
    expect(screen.queryByText("Protected profile")).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("allows an activated user into the portal", async () => {
    window.history.replaceState({}, "", "/portal/profile");
    getSession.mockResolvedValue({ data: { session: {
      ...pendingSession, user: { ...pendingSession.user, app_metadata: { enrollment_version: 3, enrollment_ready: true } },
    } }, error: null });
    render(<BrowserRouter><AuthProvider><ProtectedRoute><p>Protected profile</p></ProtectedRoute></AuthProvider></BrowserRouter>);
    await screen.findByText("Protected profile");
  });

  it("still rejects Google accounts outside PNCL", async () => {
    window.history.replaceState({}, "", "/onboarding/activate");
    render(<AuthProvider><SessionStatus /></AuthProvider>);
    await screen.findByText("Signed out");
    await act(() => listener("SIGNED_IN", { ...pendingSession, user: { ...pendingSession.user, email: "agent@gmail.com" } }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(screen.getByText("Signed out")).toBeInTheDocument();
  });
});
