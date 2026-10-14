import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PortalSetPassword from "@/pages/PortalSetPassword";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "new.agent@thepncl.com" }, loading: false }),
  isEmailConfirmed: () => true,
  mustChangePassword: () => true,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseAuthConfigured: () => true,
  getSupabaseClient: () => null,
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
// WebGL2 has no jsdom implementation; the backdrop is decorative either way.
vi.mock("@/components/ui/liquid-gradient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/liquid-gradient")>()),
  default: () => null,
}));

describe("PortalSetPassword", () => {
  it("gives the password manager a real, visible username field", () => {
    render(
      <MemoryRouter>
        <PortalSetPassword />
      </MemoryRouter>,
    );

    const username = screen.getByLabelText("Portal email");
    expect(username).toHaveAttribute("autocomplete", "username");
    expect(username).toHaveValue("new.agent@thepncl.com");
    expect(username).toHaveAttribute("readonly");
    // The old version hid this input; display:none username fields are not
    // reliably picked up by Chrome, so it must stay visible and in the form.
    expect(username).not.toHaveAttribute("hidden");
    expect(username).toBeVisible();
    const form = username.closest("form");
    expect(form).not.toBeNull();
    expect(form!.querySelectorAll('input[autocomplete="new-password"]')).toHaveLength(2);
  });
});
