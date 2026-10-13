import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminOnboardingSteps from "./AdminOnboardingSteps";
import { useAdminTodos } from "@/hooks/useAdminTodos";
import { saveOnboardingSteps, type AdminPortalTodoSummary } from "@/lib/admin-api";

vi.mock("@/hooks/useAdminTodos", () => ({ useAdminTodos: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { access_token: "admin-token" } }) }));
vi.mock("@/lib/admin-api", () => ({ saveOnboardingSteps: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const rows = [
  { id: "ica-id", slug: "ica_setup", title: "Sign ICA", description: "Sign your agreement", phase: "on_board", published: true, showLoa: true, showIbo: true },
  { id: "w9-id", slug: "w9_setup", title: "Submit W-9", phase: "on_board", published: true, showLoa: true, showIbo: false },
  { id: "unpublished-id", slug: "future_step", title: "Future step", phase: "sales_ready", published: false, showLoa: true, showIbo: true },
] as AdminPortalTodoSummary[];
const reload = vi.fn();
beforeEach(() => {
  vi.mocked(useAdminTodos).mockReturnValue({ todos: rows, totalUsers: 2, loading: false, error: null, reload, save: vi.fn(), remove: vi.fn(), reorder: vi.fn() });
  vi.mocked(saveOnboardingSteps).mockResolvedValue({ message: "Saved" });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function show() { render(<MemoryRouter><AdminOnboardingSteps /></MemoryRouter>); }
describe("Admin onboarding steps", () => {
  it("shows the configured LOA and IBO choices and excludes unpublished steps from totals", () => {
    show();
    expect(screen.getByLabelText("Show Sign ICA for IBO")).toBeChecked();
    expect(screen.getByLabelText("Show Submit W-9 for IBO")).not.toBeChecked();
    expect(screen.getByText("2 published steps")).toBeInTheDocument();
    expect(screen.getByText("1 published steps")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save onboarding steps" })).toBeDisabled();
  });
  it("filters stages without discarding selections from other stages", () => {
    show();
    fireEvent.click(screen.getByLabelText("Show Future step for IBO"));
    fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "on_board" } });
    expect(screen.queryByLabelText("Show Future step for IBO")).not.toBeInTheDocument();
    expect(screen.getByText("1 step with unsaved changes")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "all" } });
    expect(screen.getByLabelText("Show Future step for IBO")).not.toBeChecked();
  });
  it("saves only changed steps together and leaves completion data untouched", async () => {
    show();
    fireEvent.click(screen.getByLabelText("Show Sign ICA for LOA"));
    fireEvent.click(screen.getByLabelText("Show Submit W-9 for IBO"));
    expect(screen.getByText("2 steps with unsaved changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save onboarding steps" }));
    await waitFor(() => expect(saveOnboardingSteps).toHaveBeenCalledWith("admin-token", [
      { id: "ica-id", showLoa: false, showIbo: true },
      { id: "w9-id", showLoa: true, showIbo: true },
    ]));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });
  it("retains selections after a failed save so admins can retry", async () => {
    vi.mocked(saveOnboardingSteps).mockRejectedValue(new Error("Save failed"));
    show();
    fireEvent.click(screen.getByLabelText("Show Submit W-9 for IBO"));
    fireEvent.click(screen.getByRole("button", { name: "Save onboarding steps" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Show Submit W-9 for IBO")).toBeChecked();
    expect(screen.getByRole("button", { name: "Save onboarding steps" })).toBeEnabled();
    expect(reload).not.toHaveBeenCalled();
  });
  it("discards unsaved selections and allows reverting without a write", () => {
    show();
    const choice = screen.getByLabelText("Show Submit W-9 for IBO");
    fireEvent.click(choice);fireEvent.click(choice);
    expect(screen.getByRole("button", { name: "Save onboarding steps" })).toBeDisabled();
    fireEvent.click(choice);
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(choice).not.toBeChecked();
    expect(saveOnboardingSteps).not.toHaveBeenCalled();
  });
});
