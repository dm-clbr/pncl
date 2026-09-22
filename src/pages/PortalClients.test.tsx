import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalClients from "@/pages/PortalClients";
import type { PortalClientRecord } from "@/lib/client-intake";

const clientState = vi.hoisted(() => ({
  clients: [] as PortalClientRecord[],
  loading: false,
  error: null as string | null,
}));

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
vi.mock("@/hooks/usePortalClients", () => ({ usePortalClients: () => clientState }));
vi.mock("@/lib/client-intake", () => ({ clientRecordToFormData: () => ({}) }));
vi.mock("@/components/PinnacleFormPreview", () => ({
  default: () => <div data-testid="form-preview" />,
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

const CLIENT = {
  id: "c1",
  agent_user_id: "agent-1",
  primary_first_name: "Dana",
  primary_last_name: "Whitfield",
  primary_phone: "(801) 555-0137",
  primary_email: "dana@example.com",
  address: "Salt Lake City",
  date_met: "2026-03-03",
  form_data: {},
  created_at: "2026-03-04T00:00:00.000Z",
  updated_at: "2026-03-04T00:00:00.000Z",
} as unknown as PortalClientRecord;

const renderPage = () =>
  render(
    <MemoryRouter>
      <PortalClients />
    </MemoryRouter>,
  );

describe("PortalClients", () => {
  beforeEach(() => {
    clientState.clients = [];
    clientState.loading = false;
    clientState.error = null;
  });

  it("keeps the loading state", () => {
    clientState.loading = true;
    renderPage();
    expect(screen.getByLabelText("Loading clients")).toBeInTheDocument();
  });

  it("keeps the error state", () => {
    clientState.error = "Unable to load clients";
    renderPage();
    expect(screen.getByText("Unable to load clients")).toBeInTheDocument();
  });

  it("keeps the empty state and its one intake call to action", () => {
    renderPage();
    expect(screen.getByText("No clients yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start your first intake" })).toHaveAttribute(
      "href",
      "/portal/clients/new",
    );
  });

  it("lists a client as a row with its phone and date met, and a 16px search field", () => {
    clientState.clients = [CLIENT];
    renderPage();

    expect(screen.getByRole("button", { name: /Dana Whitfield/ })).toBeInTheDocument();
    expect(screen.getByText("(801) 555-0137 · Met Mar 3, 2026")).toBeInTheDocument();
    expect(screen.getByText("View form")).toBeInTheDocument();

    const search = screen.getByLabelText("Search clients");
    expect(search).toHaveAttribute("type", "search");
    expect(search).toHaveClass("portal-input");
  });
});
