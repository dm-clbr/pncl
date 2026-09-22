import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalSupport from "@/pages/PortalSupport";
import { fetchPortalTickets, type PortalTicket } from "@/lib/portal-tickets";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "agent-1", email: "agent@thepncl.com" },
    session: { access_token: "token" },
  }),
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
vi.mock("@/lib/portal-tickets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portal-tickets")>();
  return { ...actual, fetchPortalTickets: vi.fn(), submitPortalTicket: vi.fn() };
});
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TICKET: PortalTicket = {
  id: "t1",
  userId: "agent-1",
  type: "commission_dispute",
  subject: "Commission short on policy 44189",
  description: "Short by 40%.",
  status: "in_progress",
  assignedTo: null,
  resolution: "Carrier is re-running the statement.",
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <PortalSupport />
    </MemoryRouter>,
  );

describe("PortalSupport", () => {
  beforeEach(() => {
    vi.mocked(fetchPortalTickets).mockReset();
  });

  it("keeps the loading state", () => {
    vi.mocked(fetchPortalTickets).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByLabelText("Loading tickets")).toBeInTheDocument();
  });

  it("keeps the error state", async () => {
    vi.mocked(fetchPortalTickets).mockRejectedValue(new Error("Unable to load tickets."));
    renderPage();
    expect(await screen.findByText("Unable to load tickets.")).toBeInTheDocument();
  });

  it("keeps the empty state", async () => {
    vi.mocked(fetchPortalTickets).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No tickets yet")).toBeInTheDocument();
  });

  it("renders the form and lists a ticket with its status chip", async () => {
    vi.mocked(fetchPortalTickets).mockResolvedValue([TICKET]);
    renderPage();

    // Four ticket types, so the select is a Segmented control.
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/Subject/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Details/).tagName).toBe("TEXTAREA");
    expect(screen.getByRole("button", { name: /Submit ticket/ })).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("Commission short on policy 44189")).toBeInTheDocument(),
    );
    expect(screen.getByText("In progress")).toHaveClass("portal-chip", "is-pending");
    expect(
      screen.getByText("PNCL: Carrier is re-running the statement."),
    ).toBeInTheDocument();
  });
});
