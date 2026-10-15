import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalOnboardingProvider from "@/components/portal/PortalOnboardingProvider";
import PortalOnboardingAction from "@/components/portal/PortalOnboardingAction";
import PortalHeader from "@/components/portal/PortalHeader";
import { useRequiredPortalOnboarding } from "@/contexts/PortalOnboardingContext";
import { completePortalTodo, fetchPortalTodos, type PortalTodo } from "@/lib/portal-todos";
import { toast } from "sonner";

const designation = vi.hoisted(() => ({ value: "loa" }));
vi.mock("@/hooks/usePortalProfile", () => ({ usePortalProfile: () => ({ profile: { agent_designation: designation.value } }) }));

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
  designation.value = "loa";
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

  it("keeps IBO-only progress consistent across tabs", async () => {
    designation.value = "ibo";
    vi.mocked(fetchPortalTodos).mockResolvedValue([
      todo("w9_setup"), todo("direct_deposit_setup"), todo("comp_agreement"),
      { ...todo("intro"), showLoa: false, showIbo: true },
    ]);
    renderTabs();
    const name = /0 of 1 steps complete.*Next: intro.*open the checklist/;
    await screen.findByRole("button", { name });
    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(fetchPortalTodos).toHaveBeenCalledTimes(1);
  });

  it("keeps verified tutorial playback inside the header dialog and sends its completion proof", async () => {
    const proto = HTMLDialogElement.prototype;
    const showModal = proto.showModal;
    const close = proto.close;
    proto.showModal = function () { this.setAttribute("open", ""); };
    proto.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
    try {
      vi.mocked(completePortalTodo).mockResolvedValueOnce(undefined);
      vi.mocked(fetchPortalTodos).mockResolvedValue([
        { ...todo("surelc_tutorial"), title: "SureLC walkthrough", phase: "licensing", href: "https://example.test/tutorial.mp4", actionLabel: "Watch tutorial" },
      ]);
      renderTabs();
      fireEvent.click(await screen.findByRole("button", { name: /steps complete.*open the checklist/ }));
      fireEvent.click(screen.getByRole("button", { name: "Watch tutorial" }));
      const video = screen.getByLabelText("SureLC walkthrough", { selector: "video" });
      expect(video.closest("dialog[open]")).toBeInTheDocument();
      Object.defineProperty(video, "duration", { configurable: true, value: 10 });
      Object.defineProperty(video, "played", { configurable: true, value: { length: 1, start: () => 0, end: () => 10 } });
      fireEvent.ended(video);
      await waitFor(() => expect(completePortalTodo).toHaveBeenCalledWith(
        "surelc_tutorial", [expect.objectContaining({ id: "surelc_tutorial" })], { videoPlaybackVerified: true },
      ));
      expect(fetchPortalTodos).toHaveBeenCalledTimes(2);
    } finally {
      proto.showModal = showModal;
      proto.close = close;
    }
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
