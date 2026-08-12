import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminHierarchy from "@/pages/admin/AdminHierarchy";

const mocks = vi.hoisted(() => ({
  getHierarchy: vi.fn(),
  useAdminAgents: vi.fn(() => ({
    agents: [],
    loading: false,
    reload: vi.fn(),
  })),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "admin-user",
      email: "admin@thepncl.com",
      app_metadata: { role: "admin" },
      user_metadata: { full_name: "Full Admin" },
    },
    session: { access_token: "admin-token" },
  }),
}));

vi.mock("@/hooks/useAdminAgents", () => ({
  useAdminAgents: mocks.useAdminAgents,
}));

vi.mock("@/lib/admin-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-api")>();
  return {
    ...actual,
    getHierarchy: mocks.getHierarchy,
    downloadAgentsCsv: vi.fn(),
  };
});

vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

vi.mock("@/components/admin/HierarchyCanvas", () => ({
  HierarchyCanvas: () => <div>Canvas hierarchy</div>,
}));

vi.mock("@/components/admin/HierarchyTree", () => ({
  HierarchyTree: () => <div>Tree hierarchy</div>,
}));

describe("full admin hierarchy preview", () => {
  it("loads and displays the server-backed admin assist view", async () => {
    mocks.getHierarchy
      .mockResolvedValueOnce({ tree: [], totalAgents: 0 })
      .mockResolvedValueOnce({ tree: [], focusOptions: [], totalAgents: 0, readOnly: true });

    render(<AdminHierarchy />);

    await waitFor(() => {
      expect(mocks.getHierarchy).toHaveBeenNthCalledWith(1, "admin-token", undefined, {
        viewAsAdminAssist: false,
      });
    });

    expect(screen.getByRole("button", { name: "View as admin assist" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View as admin assist" }));

    await waitFor(() => {
      expect(mocks.getHierarchy).toHaveBeenNthCalledWith(2, "admin-token", undefined, {
        viewAsAdminAssist: true,
      });
    });

    expect(screen.getByText("Viewing as admin assist")).toBeInTheDocument();
    expect(screen.getByText(/restricted, read-only hierarchy experience/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exit admin assist view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: "Download CSV" })).not.toBeInTheDocument();
    expect(screen.getByText(/select any person to see email, upline, downline, and NPN details/i))
      .toBeInTheDocument();
  });
});
