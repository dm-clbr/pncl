import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalStateMap from "@/pages/PortalStateMap";
import { US_STATES, type UsStateCode } from "@/lib/us-states";

const availability = US_STATES.map((state) => ({
  stateCode: state.code,
  stateName: state.name,
  status: state.code === "DC" ? "Active" as const : state.code === "CA" ? "Pending" as const : "Inactive" as const,
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
    profile: { address_state: "DC", state_license_numbers: { DC: "LIC-DC" } },
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
    expect(screen.getByRole("button", {
      name: "District of Columbia: Active, licensed on your profile",
    })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "California: Pending" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(50);
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
    expect(screen.getByTestId("three-state-map")).toHaveAttribute("data-licensed-states", "DC");
    expect(screen.getAllByRole("button", { name: /availability unavailable/i })).toHaveLength(51);
    expect(screen.getByRole("button", {
      name: "District of Columbia: availability unavailable, licensed on your profile",
    })).toBeInTheDocument();
    expect(screen.getByText("Availability unavailable", {
      selector: ".state-map-detail-status",
    })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("gives the map a single-pointer zoom alternative to pinch", async () => {
    // The page mocks the canvas module, so the real one comes in through
    // importActual. WebGL is unavailable under jsdom: the controls sit outside
    // that failure path, which is the point of the assertion. The stub keeps
    // jsdom's not-implemented trace out of the run.
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    const { default: StateAvailabilityCanvas } = await vi.importActual<
      typeof import("@/components/StateAvailabilityCanvas")
    >("@/components/StateAvailabilityCanvas");

    render(
      <StateAvailabilityCanvas
        states={availability}
        licensedStates={new Set<UsStateCode>(["DC"])}
        selectedState="DC"
        onHover={() => {}}
        onSelect={() => {}}
      />,
    );

    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    expect(zoomIn).toBeEnabled();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset zoom" })).toBeDisabled();

    fireEvent.click(zoomIn);
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reset zoom" })).toBeEnabled();

    getContext.mockRestore();
  });

  it("keeps the zoomed camera on the map and drops off-screen frames", async () => {
    const { cameraCenter, canDrawFrame, rendererPixelRatio } = await vi.importActual<
      typeof import("@/components/StateAvailabilityCanvas")
    >("@/components/StateAvailabilityCanvas");

    // Frustum halves at zoom 1 for a 1440 wide shell: 530 by 340 map units.
    // Zoom 1 ignores the selection and pins the map centre.
    expect(cameraCenter(1, 530, 340, { x: 900, y: -120 })).toEqual({ x: 487.5, y: -305 });
    // Zoomed in, the camera follows a state inside the margin...
    expect(cameraCenter(2, 530, 340, { x: 600, y: -260 })).toEqual({ x: 600, y: -260 });
    // ...and clamps at the edge for one outside it, instead of panning off the
    // atlas. Margin at zoom 2 is half of each half-frustum: 265 and 170.
    expect(cameraCenter(2, 530, 340, { x: 1000, y: -20 })).toEqual({ x: 752.5, y: -135 });

    // The render gate: an off-screen or backgrounded ask never reaches the GPU.
    expect(canDrawFrame(true, false)).toBe(true);
    expect(canDrawFrame(false, false)).toBe(false);
    expect(canDrawFrame(true, true)).toBe(false);

    // Touch renders at dpr 1 whatever the screen claims.
    expect(rendererPixelRatio(true, 3)).toBe(1);
    expect(rendererPixelRatio(false, 3)).toBe(2);
    expect(rendererPixelRatio(false, 1)).toBe(1);
  });
});
