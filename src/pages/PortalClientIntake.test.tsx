import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PortalClientIntake from "@/pages/PortalClientIntake";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "agent-1", email: "agent@thepncl.com" } }),
}));
vi.mock("@/hooks/usePortalProfile", () => ({
  usePortalProfile: () => ({
    profile: null,
    photoUrl: null,
    initials: "PG",
    displayName: "Porter Gerlach",
    loading: false,
  }),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: () => ({}) }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <PortalClientIntake />
    </MemoryRouter>,
  );

describe("PortalClientIntake", () => {
  it("opens on the intro with the three stages and the start action", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Client intake" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Client intake form" })).toBeInTheDocument();
    const stages = screen.getByRole("list", { name: "Intake stages" });
    expect(stages).toHaveTextContent("Script");
    expect(stages).toHaveTextContent("Form");
    expect(stages).toHaveTextContent("Review");
    expect(screen.getByRole("button", { name: "Start intake" })).toBeInTheDocument();
  });

  it("shows one question with a counter and a gated Continue once started", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Start intake" }));

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByText(/^Step 1 of /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("enables Continue when the answer satisfies the existing validation", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Start intake" }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Dana Whitfield" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});
