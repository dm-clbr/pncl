import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AdminFullRoute from "@/components/AdminFullRoute";
import AdminLayout from "@/components/AdminLayout";
import AdminRoute from "@/components/AdminRoute";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "assist-user",
      email: "assist@thepncl.com",
      app_metadata: { role: "admin_assist" },
      user_metadata: { full_name: "Hierarchy Assistant" },
    },
    loading: false,
  }),
}));

describe("admin_assist client access", () => {
  it("shows hierarchy as the only admin navigation destination", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<AdminLayout />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Hierarchy" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Genesis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "State availability" })).not.toBeInTheDocument();
  });

  it("redirects restricted nested admin routes to hierarchy", () => {
    render(
      <MemoryRouter initialEntries={["/portal/admin/users"]}>
        <Routes>
          <Route
            path="/portal/admin/users"
            element={<AdminFullRoute><div>Users screen</div></AdminFullRoute>}
          />
          <Route path="/portal/admin/hierarchy" element={<div>Hierarchy screen</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Hierarchy screen")).toBeInTheDocument();
    expect(screen.queryByText("Users screen")).not.toBeInTheDocument();
  });

  it("redirects direct Genesis route access to hierarchy", () => {
    render(
      <MemoryRouter initialEntries={["/portal/admin/genesis"]}>
        <Routes>
          <Route
            path="/portal/admin/genesis"
            element={<AdminRoute><div>Genesis screen</div></AdminRoute>}
          />
          <Route path="/portal/admin/hierarchy" element={<div>Hierarchy screen</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Hierarchy screen")).toBeInTheDocument();
    expect(screen.queryByText("Genesis screen")).not.toBeInTheDocument();
  });
});
