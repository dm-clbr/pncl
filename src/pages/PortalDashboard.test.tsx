import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import PortalDashboard from "@/pages/PortalDashboard";
import type { PortalTodo } from "@/lib/portal-todos";

function todo(overrides: Partial<PortalTodo>): PortalTodo {
  return {
    id: "todo",
    title: "Onboarding step",
    description: "Complete this step.",
    href: "",
    external: false,
    actionLabel: "Open step",
    phase: "on_board",
    completionType: "agent",
    completed: false,
    ...overrides,
  };
}

let todos: PortalTodo[] = [];
/** Whether the (max-width: 620px) query matches; every other query stays false. */
let narrow = false;

// One stable object: the page mirrors authUser into state in an effect keyed
// on its identity, so a fresh object per render would loop under act().
const auth = vi.hoisted(() => ({
  user: { id: "agent-1", email: "agent@thepncl.com", user_metadata: {}, app_metadata: {} },
  signOut: () => Promise.resolve(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/usePortalTodos", () => ({ usePortalTodos: () => ({ todos }) }));
vi.mock("@/hooks/usePortalDashboardTabs", () => ({
  usePortalDashboardTabs: () => ({ sections: [] }),
}));
vi.mock("@/hooks/usePortalCarriers", () => ({ usePortalCarriers: () => ({ carriers: [] }) }));
vi.mock("@/hooks/usePortalIca", () => ({ usePortalIca: () => ({ submitted: false }) }));
vi.mock("@/hooks/usePortalW9", () => ({ usePortalW9: () => ({ submitted: false }) }));
vi.mock("@/hooks/usePortalDirectDeposit", () => ({
  usePortalDirectDeposit: () => ({ submitted: false }),
}));
vi.mock("@/hooks/usePortalIncentives", () => ({
  usePortalIncentives: () => ({ incentives: [], loading: false }),
}));
vi.mock("@/hooks/usePortalBrandAssets", () => ({
  usePortalBrandAssets: () => ({ assets: [], loading: false }),
}));
vi.mock("@/hooks/usePortalProfile", () => ({
  usePortalProfile: () => ({
    profile: { recovery_email: "agent@example.com", recovery_email_sync_status: "synced" },
    photoUrl: null,
    initials: "TA",
    displayName: "Test Agent",
    loading: false,
  }),
}));
vi.mock("@/components/PortalReferralPanel", () => ({ default: () => null }));
vi.mock("@/components/ui/liquid-gradient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/liquid-gradient")>()),
  default: () => null,
}));
vi.mock("@/lib/portal-messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-messages")>()),
  refreshPortalUser: () => Promise.resolve(null),
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

// jsdom ships HTMLDialogElement without showModal, close or the open
// reflection (same stand-in as src/components/portal/primitives.test.tsx).
beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (!("open" in proto)) {
    Object.defineProperty(proto, "open", {
      configurable: true,
      get(this: HTMLDialogElement) {
        return this.hasAttribute("open");
      },
      set(this: HTMLDialogElement, value: boolean) {
        if (value) this.setAttribute("open", "");
        else this.removeAttribute("open");
      },
    });
  }
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

beforeEach(() => {
  narrow = false;
  todos = [
    todo({ id: "welcome", title: "Watch the welcome video" }),
    todo({ id: "profile", title: "Complete your profile", completed: true }),
    todo({ id: "exam", title: "Book the state exam", phase: "pre_license" }),
  ];
  window.matchMedia = (query: string) =>
    ({
      matches: narrow && query === "(max-width: 620px)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

function renderDashboard() {
  const view = render(<MemoryRouter><PortalDashboard /></MemoryRouter>);
  return {
    ...view,
    capsule: screen.getByRole("button", { name: /steps complete.*open the checklist/ }),
    panel: document.querySelector("dialog.pdock-panel") as HTMLDialogElement,
  };
}

describe("PortalDashboard onboarding dock", () => {
  it("shows the stage, the count and the next step on the capsule", () => {
    const { capsule, panel } = renderDashboard();

    expect(capsule).toHaveAttribute("aria-haspopup", "dialog");
    expect(capsule).toHaveAttribute("aria-expanded", "false");
    expect(capsule).toHaveTextContent("On-Board");
    expect(capsule).toHaveTextContent("1 of 3");
    expect(capsule).toHaveTextContent("Next: Watch the welcome video");
    expect(panel).not.toHaveAttribute("open");
    // The checklist mounts with the panel, not before it.
    expect(screen.queryByText("Book the state exam")).toBeNull();
  });

  it("opens the panel at every width and pins the current stage in the Stepper", () => {
    for (const width of [false, true]) {
      narrow = width;
      const { capsule, panel, unmount } = renderDashboard();
      fireEvent.click(capsule);
      expect(panel).toHaveAttribute("open");
      expect(capsule).toHaveAttribute("aria-expanded", "true");
      expect(within(panel).getByRole("heading", { name: "Onboarding" })).toBeInTheDocument();
      expect(within(panel).getByText("Watch the welcome video")).toBeInTheDocument();
      unmount();
    }
  });

  it("follows the stages as steps complete", () => {
    const { capsule, panel, rerender } = renderDashboard();
    const stages = () => within(panel).getByRole("list", { name: "Onboarding stages" });
    const currentStage = () => within(stages()).queryByRole("listitem", { current: "step" });

    fireEvent.click(capsule);
    expect(currentStage()).toHaveTextContent("On-Board");

    // First stage done: the next stage with a pending step is current.
    todos = todos.map((item) => (item.phase === "on_board" ? { ...item, completed: true } : item));
    rerender(<MemoryRouter><PortalDashboard /></MemoryRouter>);
    expect(currentStage()).toHaveTextContent("Pre-License");
    expect(capsule).toHaveTextContent("2 of 3");
    expect(capsule).toHaveTextContent("Next: Book the state exam");

    // Everything done: no stage is current and every stage reads as completed.
    todos = todos.map((item) => ({ ...item, completed: true }));
    rerender(<MemoryRouter><PortalDashboard /></MemoryRouter>);
    expect(currentStage()).toBeNull();
    expect(within(stages()).getAllByRole("listitem").map((li) => li.className)).toEqual(
      Array(5).fill("portal-step is-done"),
    );
    expect(capsule).toHaveTextContent("3 of 3");
    expect(capsule).toHaveTextContent("You're sales ready");
  });
});
