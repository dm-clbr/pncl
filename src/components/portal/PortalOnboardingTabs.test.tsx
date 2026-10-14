import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalOnboardingProvider from "@/components/portal/PortalOnboardingProvider";
import PortalOnboardingAction from "@/components/portal/PortalOnboardingAction";
import PortalHeader from "@/components/portal/PortalHeader";
import { useRequiredPortalOnboarding } from "@/contexts/PortalOnboardingContext";
import { completePortalTodo, fetchPortalTodos, type PortalTodo } from "@/lib/portal-todos";
import { toast } from "sonner";

const auth = vi.hoisted(() => ({
  user: { id: "agent-1", email: "agent@thepncl.com", user_metadata: {}, app_metadata: {} },
  session: { access_token: "fixture-token" },
  loading: false,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/usePortalCarriers", () => ({ usePortalCarriers: () => ({ carriers: [] }) }));
vi.mock("@/hooks/usePortalIca", () => ({ usePortalIca: () => ({ submitted: true }) }));
vi.mock("@/hooks/usePortalW9", () => ({ usePortalW9: () => ({ submitted: false }) }));
vi.mock("@/hooks/usePortalDirectDeposit", () => ({ usePortalDirectDeposit: () => ({ submitted: false }) }));
vi.mock("@/lib/portal-messages", () => ({ refreshPortalUser: () => Promise.resolve(null) }));
vi.mock("@/lib/portal-todos", async (original) => ({
  ...(await original<typeof import("@/lib/portal-todos")>()),
  fetchPortalTodos: vi.fn(),
  completePortalTodo: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const tabs = ["Dashboard", "Calendar", "State Map", "Profile"];
const todo = (id: string): PortalTodo => ({
  id, title: id, description: "", href: "", external: false,
  actionLabel: "Open", phase: "on_board", completionType: "agent", completed: false,
});

function Tab({ name }: { name: string }) {
  const onboarding = useRequiredPortalOnboarding();
  return <>
    <PortalHeader name="Test Agent" initials="TA" action={<PortalOnboardingAction />} />
    <nav>{tabs.map((label, index) => <Link key={label} to={`/tab-${index}`}>{label}</Link>)}</nav>
    <h2>{name}</h2>
    <span data-testid="busy-todo">{onboarding.completingTodoId ?? "idle"}</span>
    <button onClick={() => void onboarding.completeTodo("w9_setup")}>Complete test step</button>
    <button onClick={() => void onboarding.reloadTodos()}>Refresh progress</button>
  </>;
}

function renderTabs() {
  render(<MemoryRouter initialEntries={["/tab-0"]}>
    <Routes><Route element={<PortalOnboardingProvider />}>
      {tabs.map((name, index) => <Route key={name} path={`/tab-${index}`} element={<Tab name={name} />} />)}
    </Route></Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPortalTodos).mockResolvedValue([todo("ica_setup"), todo("w9_setup")]);
});

describe("shared onboarding across portal tabs", () => {
  it("retains resolved progress without fetching todos again on navigation", async () => {
    renderTabs();
    const name = /1 of 2 steps complete.*Next: w9_setup.*open the checklist/;
    await screen.findByRole("button", { name });
    for (const label of tabs) {
      fireEvent.click(screen.getByRole("link", { name: label }));
      expect(screen.getByRole("button", { name }).closest(".portal-header-actions")).toBeInTheDocument();
    }
    expect(fetchPortalTodos).toHaveBeenCalledTimes(1);
    expect(fetchPortalTodos).toHaveBeenCalledWith("fixture-token");
  });

  it("keeps the pill present during a refresh and shares updated completion", async () => {
    renderTabs();
    const pendingName = /1 of 2 steps complete.*open the checklist/;
    await screen.findByRole("button", { name: pendingName });
    let resolve!: (todos: PortalTodo[]) => void;
    vi.mocked(fetchPortalTodos).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh progress" }));
    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));
    expect(screen.getByRole("button", { name: pendingName })).toBeInTheDocument();
    resolve([todo("ica_setup"), { ...todo("w9_setup"), completed: true }]);
    const completed = await screen.findByRole("button", { name: /2 of 2 steps complete.*open the checklist/ });
    expect(completed).toHaveTextContent("You're sales ready");
    expect(completed).not.toHaveAttribute("data-pending");
    expect(fetchPortalTodos).toHaveBeenCalledTimes(2);
  });

  it("retains an in-flight completion across tabs and reports its failure", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(completePortalTodo).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    renderTabs();
    await screen.findByRole("button", { name: /steps complete.*open the checklist/ });
    fireEvent.click(screen.getByRole("button", { name: "Complete test step" }));
    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));
    expect(screen.getByTestId("busy-todo")).toHaveTextContent("w9_setup");
    reject(new Error("Unable to save this step"));
    await waitFor(() => expect(screen.getByTestId("busy-todo")).toHaveTextContent("idle"));
    expect(toast.error).toHaveBeenCalledWith("Unable to save this step");
    expect(completePortalTodo).toHaveBeenCalledWith("w9_setup", [
      expect.objectContaining({ id: "ica_setup", completed: true }),
      expect.objectContaining({ id: "w9_setup", completed: false }),
    ]);
  });
});
