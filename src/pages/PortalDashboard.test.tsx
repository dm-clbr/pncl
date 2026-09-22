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
    strip: screen.getByRole("link", { name: /steps complete, open the checklist/ }),
    sheet: document.querySelector("dialog.portal-sheet") as HTMLDialogElement,
  };
}

describe("PortalDashboard progress strip", () => {
  it("stays an anchor to the rail pane above 620px", () => {
    const { strip, sheet } = renderDashboard();

    expect(strip).toHaveAttribute("href", "#onboarding-checklist");
    expect(strip).toHaveTextContent("On-Board");
    expect(strip).toHaveTextContent("1 of 3");
    expect(document.getElementById("onboarding-checklist")).toHaveClass("pcl-rail");

    // Default not prevented: the browser follows the hash to the rail.
    expect(fireEvent.click(strip)).toBe(true);
    expect(sheet).not.toHaveAttribute("open");
  });

  it("opens the checklist sheet at 620px and pins the current stage in the Stepper", () => {
    narrow = true;
    const { strip, sheet, rerender } = renderDashboard();
    const currentStage = () =>
      within(within(sheet).getByRole("list", { name: "Progress" }))
        .queryByRole("listitem", { current: "step" });

    expect(sheet).not.toHaveAttribute("open");
    expect(fireEvent.click(strip)).toBe(false);
    expect(sheet).toHaveAttribute("open");
    expect(currentStage()).toHaveTextContent("On-Board");

    // First stage done: the next stage with a pending step is current.
    todos = todos.map((item) => (item.phase === "on_board" ? { ...item, completed: true } : item));
    rerender(<MemoryRouter><PortalDashboard /></MemoryRouter>);
    expect(currentStage()).toHaveTextContent("Pre-License");
    expect(strip).toHaveTextContent("2 of 3");

    // Everything done: no stage is current and every stage reads as completed.
    todos = todos.map((item) => ({ ...item, completed: true }));
    rerender(<MemoryRouter><PortalDashboard /></MemoryRouter>);
    expect(currentStage()).toBeNull();
    expect(
      within(within(sheet).getByRole("list", { name: "Progress" }))
        .getAllByRole("listitem")
        .map((li) => li.className),
    ).toEqual(Array(5).fill("portal-step is-done"));
    expect(strip).toHaveTextContent("3 of 3");
  });
});
