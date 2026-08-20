import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalStateMap from "@/pages/PortalStateMap";
import { US_STATES } from "@/lib/us-states";

const availability = US_STATES.map((state) => ({
  stateCode: state.code,
  stateName: state.name,
  status: state.code === "UT" ? "Active" as const : state.code === "CA" ? "Pending" as const : "Inactive" as const,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
}));
const reload = vi.fn();
let availabilityError: string | null = null;
let availabilityStates = availability;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "agent-1", email: "agent@thepncl.com", user_metadata: { full_name: "Test Agent" } },
  }),
}));

vi.mock("@/hooks/usePortalProfile", () => ({
  usePortalProfile: () => ({
    profile: { address_state: "UT", state_license_numbers: { UT: "LIC-123" } },
    photoUrl: null,
    initials: "TA",
    displayName: "Test Agent",
    loading: false,
  }),
}));

vi.mock("@/hooks/useStateAvailability", () => ({
  useStateAvailability: () => ({
    states: availabilityStates,
    loading: false,
    error: availabilityError,
    reload,
  }),
}));

vi.mock("@/components/StateAvailabilityCanvas", () => ({
  default: ({
    availabilityUnavailable,
    licensedStates,
  }: {
    availabilityUnavailable?: boolean;
    licensedStates: Set<string>;
  }) => (
    <div
      data-testid="three-state-map"
      data-availability-unavailable={availabilityUnavailable ? "true" : "false"}
      data-licensed-states={[...licensedStates].sort().join(",")}
      aria-hidden="true"
    />
  ),
}));

vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

describe("portal state map", () => {
  beforeEach(() => {
    availabilityError = null;
    availabilityStates = availability;
    reload.mockReset();
  });

  it("renders the Three.js surface and a complete accessible state directory", async () => {
    render(<MemoryRouter><PortalStateMap /></MemoryRouter>);

    expect(await screen.findByTestId("three-state-map")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PNCL State Map" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Agent portal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Utah: Active, licensed on your profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "California: Pending" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(49);
    expect(screen.getByText("Licensed on your profile", { selector: ".state-map-license-note" })).toBeInTheDocument();
  });

  it("keeps a neutral map and accessible state directory available when live data fails", async () => {
    availabilityError = "Unable to load state availability.";
    availabilityStates = [];

    render(<MemoryRouter><PortalStateMap /></MemoryRouter>);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Live state availability is temporarily unavailable.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "No company status should be inferred from these colors.",
    );
    expect(await screen.findByTestId("three-state-map")).toHaveAttribute(
      "data-availability-unavailable",
      "true",
    );
    expect(screen.getByTestId("three-state-map")).toHaveAttribute("data-licensed-states", "UT");
    expect(screen.getAllByRole("button", { name: /availability unavailable/i })).toHaveLength(50);
    expect(screen.getByRole("button", {
      name: "Utah: availability unavailable, licensed on your profile",
    })).toBeInTheDocument();
    expect(screen.getByText("Availability unavailable", {
      selector: ".state-map-detail-status",
    })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
