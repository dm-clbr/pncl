import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
    filter,
  }: {
    availabilityUnavailable?: boolean;
    licensedStates: Set<string>;
    filter?: string | null;
  }) => (
    <div
      data-testid="three-state-map"
      data-availability-unavailable={availabilityUnavailable ? "true" : "false"}
      data-licensed-states={[...licensedStates].sort().join(",")}
      data-filter={filter ?? "none"}
      aria-hidden="true"
    />
  ),
}));

// jsdom 20 ships HTMLDialogElement without showModal, close or the open
// reflection, so the mobile detail Sheet needs the same stand-in the primitives
// suite installs.
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

/** Forces the page's (max-width: 620px) branch. Returns the spy to restore. */
const matchCompactViewport = () => vi.spyOn(window, "matchMedia").mockImplementation(
  (query: string) => ({
    matches: query === "(max-width: 620px)",
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList,
);

const directoryRows = (container: HTMLElement) =>
  container.querySelectorAll(".state-map-list > li");

vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

describe("portal state map", () => {
  beforeEach(() => {
    availabilityError = null;
    availabilityStates = availability;
    reload.mockReset();
  });

  it("renders the Three.js surface and a complete accessible state directory", async () => {
    const { container } = render(<MemoryRouter><PortalStateMap /></MemoryRouter>);

    expect(await screen.findByTestId("three-state-map")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "State map" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Agent portal" })).toBeInTheDocument();
    expect(directoryRows(container)).toHaveLength(51);
    // The row carries its status and the licence in its accessible name, so
    // neither is left to the colour on the canvas.
    expect(screen.getByRole("button", {
      name: "District of Columbia Active Licensed",
    })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "California Pending" })).toBeInTheDocument();
    expect(screen.getByText("Licensed on your profile", { selector: ".state-map-license-note" })).toBeInTheDocument();
  });

  it("filters the directory, the chips and the canvas together", async () => {
    const { container } = render(<MemoryRouter><PortalStateMap /></MemoryRouter>);
    await screen.findByTestId("three-state-map");
    expect(screen.getByTestId("three-state-map")).toHaveAttribute("data-filter", "none");

    const pending = screen.getByRole("button", { name: "1 Pending", pressed: false });
    fireEvent.click(pending);
    expect(screen.getByRole("button", { name: "1 Pending", pressed: true })).toBe(pending);
    expect(directoryRows(container)).toHaveLength(1);
    expect(screen.getByTestId("three-state-map")).toHaveAttribute("data-filter", "Pending");

    // Same chip again clears the filter.
    fireEvent.click(pending);
    expect(directoryRows(container)).toHaveLength(51);

    const search = screen.getByLabelText("Search states");
    fireEvent.change(search, { target: { value: "cali" } });
    expect(directoryRows(container)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "California Pending" })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(directoryRows(container)).toHaveLength(0);
    expect(screen.getByText("No states match")).toBeInTheDocument();
  });

  it("opens the detail in a half-height sheet when a state is picked on a phone", async () => {
    const matchMedia = matchCompactViewport();
    render(<MemoryRouter><PortalStateMap /></MemoryRouter>);
    await screen.findByTestId("three-state-map");

    // The selection the page makes on load must not open a modal over the map.
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: "Texas Inactive" }));
    const sheet = screen.getByRole("dialog", { name: "Texas" });
    expect(sheet).toHaveAttribute("open");
    expect(sheet).toHaveClass("is-half");
    expect(sheet).toHaveTextContent("No license recorded on your profile.");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(sheet).not.toHaveAttribute("open");
    matchMedia.mockRestore();
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
    expect(screen.getAllByRole("button", { name: /Unavailable/ })).toHaveLength(51);
    expect(screen.getByRole("button", {
      name: "District of Columbia Unavailable Licensed",
    })).toBeInTheDocument();
    expect(screen.getByText("Availability unavailable", {
      selector: ".portal-chip",
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

    // The filter predicate the canvas dim and the directory both read.
    const { matchesFilter } = await vi.importActual<
      typeof import("@/components/portal/state-map-filter")
    >("@/components/portal/state-map-filter");
    expect(matchesFilter(null, "Inactive", false)).toBe(true);
    expect(matchesFilter("Active", "Active", false)).toBe(true);
    expect(matchesFilter("Active", "Pending", true)).toBe(false);
    expect(matchesFilter("Licensed", "Inactive", true)).toBe(true);
    expect(matchesFilter("Licensed", "Active", false)).toBe(false);

    // Touch renders at dpr 1 whatever the screen claims.
    expect(rendererPixelRatio(true, 3)).toBe(1);
    expect(rendererPixelRatio(false, 3)).toBe(2);
    expect(rendererPixelRatio(false, 1)).toBe(1);
  });

  it("commits a map pick on a tap but not on a scroll gesture", async () => {
    const { isTap } = await vi.importActual<
      typeof import("@/components/StateAvailabilityCanvas")
    >("@/components/StateAvailabilityCanvas");

    // A finger never lands and lifts on exactly the same pixel.
    expect(isTap({ x: 200, y: 400 }, { x: 200, y: 400 })).toBe(true);
    expect(isTap({ x: 200, y: 400 }, { x: 203, y: 404 })).toBe(true);
    // 8px is the edge of a tap, inclusive.
    expect(isTap({ x: 200, y: 400 }, { x: 200, y: 408 })).toBe(true);
    // A vertical swipe over the pinned map is a scroll, not a pick.
    expect(isTap({ x: 200, y: 400 }, { x: 200, y: 391 })).toBe(false);
    expect(isTap({ x: 200, y: 400 }, { x: 200, y: 520 })).toBe(false);
    expect(isTap({ x: 200, y: 400 }, { x: 260, y: 400 })).toBe(false);
  });
});
