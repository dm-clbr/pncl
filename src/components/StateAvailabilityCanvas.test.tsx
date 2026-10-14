import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StateAvailabilityCanvas, {
  cameraCenter,
  canDrawFrame,
  isTap,
  rendererPixelRatio,
} from "@/components/StateAvailabilityCanvas";
import { matchesFilter } from "@/components/portal/state-map-filter";
import { US_STATES, type UsStateCode } from "@/lib/us-states";

/* The Three.js map no longer renders on /portal/state-map (StateMapSvg does),
   but it stays in the tree so rolling back is a one-line import swap. These
   are its tests, moved here unchanged from the page suite. */

const availability = US_STATES.map((state) => ({
  stateCode: state.code,
  stateName: state.name,
  status: state.code === "DC" ? "Active" as const : state.code === "CA" ? "Pending" as const : "Inactive" as const,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
}));

describe("StateAvailabilityCanvas (kept for rollback)", () => {
  it("gives the map a single-pointer zoom alternative to pinch", () => {
    // WebGL is unavailable under jsdom: the controls sit outside that failure
    // path, which is the point of the assertion. The stub keeps jsdom's
    // not-implemented trace out of the run.
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);

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

  it("keeps the zoomed camera on the map and drops off-screen frames", () => {
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

  it("commits a map pick on a tap but not on a scroll gesture", () => {
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
