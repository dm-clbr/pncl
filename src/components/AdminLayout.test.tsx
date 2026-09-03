import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "@/components/AdminLayout";

const authState = vi.hoisted(() => ({
  user: {
    id: "admin-user",
    email: "admin@thepncl.com",
    app_metadata: { role: "admin" },
    user_metadata: { full_name: "Alex Admin" },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: authState.user, loading: false }),
}));

function setMobileViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function setRole(role: "admin" | "genesis_admin" | "admin_assist") {
  authState.user = {
    ...authState.user,
    id: `${role}-user`,
    email: `${role}@thepncl.com`,
    app_metadata: { role },
    user_metadata: { full_name: role === "admin" ? "Alex Admin" : role },
  };
}

function renderAdminLayout(path = "/portal/admin") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/portal/admin/*" element={<AdminLayout />}>
          <Route path="*" element={<div>Admin page content</div>} />
        </Route>
        <Route path="/portal" element={<div>Agent portal page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("admin sidebar layout", () => {
  beforeEach(() => {
    setRole("admin");
    setMobileViewport(false);
    window.localStorage.clear();
    document.body.style.overflow = "";
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = "";
  });

  it("preserves full-admin destinations and marks the matching route active", () => {
    renderAdminLayout("/portal/admin/users/agent-123");

    const navigation = screen.getByRole("navigation", { name: "Admin navigation" });
    expect(within(navigation).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/portal/admin",
    );
    expect(within(navigation).getByRole("link", { name: "Users" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).queryByRole("link", { name: "Genesis" })).not.toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "W-9 preview" })).toBeInTheDocument();
    expect(within(navigation).getAllByRole("link")).toHaveLength(21);
    expect(screen.getByRole("link", { name: "Agent portal" })).toHaveAttribute("href", "/portal");
  });

  it("keeps navigation destinations scoped to each admin role", () => {
    setRole("genesis_admin");
    const genesisView = renderAdminLayout("/portal/admin/genesis");
    let navigation = screen.getByRole("navigation", { name: "Admin navigation" });

    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Genesis",
      "Onboarding preview",
      "W-9 preview",
    ]);

    genesisView.unmount();
    setRole("admin_assist");
    renderAdminLayout("/portal/admin/hierarchy");
    navigation = screen.getByRole("navigation", { name: "Admin navigation" });

    expect(within(navigation).getAllByRole("link")).toHaveLength(1);
    expect(within(navigation).getByRole("link", { name: "Hierarchy" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("collapses to an accessible icon rail and persists the preference", () => {
    const firstView = renderAdminLayout();
    const collapseButton = screen.getByRole("button", { name: "Collapse navigation" });

    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapseButton);

    expect(firstView.container.querySelector(".admin-shell")).toHaveClass("admin-shell-collapsed");
    expect(screen.getByRole("button", { name: "Expand navigation" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("link", { name: "Hierarchy" })).toHaveAttribute("title", "Hierarchy");
    expect(screen.getByRole("link", { name: "Agent portal" })).toHaveAttribute("title", "Agent portal");
    expect(window.localStorage.getItem("pncl.admin.sidebar.collapsed")).toBe("true");

    firstView.unmount();
    const secondView = renderAdminLayout();
    expect(secondView.container.querySelector(".admin-shell")).toHaveClass("admin-shell-collapsed");
    expect(screen.getByRole("button", { name: "Expand navigation" }).tagName).toBe("BUTTON");
  });

  it("uses an accessible, keyboard-dismissable drawer on mobile", () => {
    setMobileViewport(true);
    renderAdminLayout();

    const menuButton = screen.getByRole("button", { name: "Open navigation" });
    const sidebar = screen.getByLabelText("Admin navigation panel", { selector: "aside" });

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(sidebar).toHaveAttribute("aria-hidden", "true");
    expect(sidebar).toHaveAttribute("inert");

    fireEvent.click(menuButton);

    const dialog = screen.getByRole("dialog", { name: "Admin navigation panel" });
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(dialog).not.toHaveAttribute("aria-hidden");
    expect(dialog).not.toHaveAttribute("inert");
    expect(within(dialog).getByRole("button", { name: "Close navigation" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    const lastLink = within(dialog).getByRole("link", { name: "Agent portal" });
    const firstLink = within(dialog).getByRole("link", { name: "PNCL home" });
    lastLink.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(firstLink).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(sidebar).toHaveAttribute("aria-hidden", "true");
    expect(menuButton).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes the mobile drawer after navigating", () => {
    setMobileViewport(true);
    renderAdminLayout();

    const menuButton = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(menuButton);
    fireEvent.click(screen.getByRole("link", { name: "Hierarchy" }));

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Admin navigation panel", { selector: "aside" })).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
