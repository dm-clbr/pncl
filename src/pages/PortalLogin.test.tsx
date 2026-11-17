import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalLogin from "@/pages/PortalLogin";

let configured = true;
const signIn = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, signInWithGoogle: signIn }),
  isEmailConfirmed: () => false,
}));
vi.mock("@/lib/supabase", () => ({ isSupabaseAuthConfigured: () => configured }));
vi.mock("@/lib/portal-auth", () => ({
  consumePortalOAuthReturn: () => null,
  isPendingPortalEnrollment: () => false,
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
// WebGL2 has no jsdom implementation; the backdrop is decorative either way.
vi.mock("@/components/ui/liquid-gradient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/liquid-gradient")>()),
  default: () => null,
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <PortalLogin />
    </MemoryRouter>,
  );
}

describe("PortalLogin", () => {
  beforeEach(() => {
    configured = true;
    signIn.mockClear();
  });

  it('preserves the originating LeadSpply account through the Google sign-in round trip', async () => {
    const search = '?leadspplyUserId=22222222-2222-4222-8222-222222222222';
    render(<MemoryRouter initialEntries={[{ pathname: '/portal/login', state: { from: { pathname: '/portal/pay', search } } }]}><PortalLogin /></MemoryRouter>);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' })));
    expect(signIn).toHaveBeenCalledWith('/portal/pay' + search);
  });

  it("offers Google sign-in when auth is configured", () => {
    renderLogin();

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the unconfigured error instead of the sign-in button", () => {
    configured = false;
    renderLogin();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Portal authentication is not configured.");
    expect(alert).toHaveTextContent("VITE_SUPABASE_URL");
    expect(alert).toHaveTextContent("VITE_SUPABASE_ANON_KEY");
    expect(screen.queryByRole("button", { name: "Sign in with Google" })).not.toBeInTheDocument();
  });
});
