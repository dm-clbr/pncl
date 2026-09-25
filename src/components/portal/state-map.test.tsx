import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Segmented from "@/components/portal/Segmented";
import StateMapSvg from "@/components/portal/StateMapSvg";
import {
  FLING_SETTLE_MS,
  SETTLE_MS,
  releaseVelocity,
  resolveSnap,
  rubberBand,
  settleDuration,
} from "@/components/portal/SnapSheet";
import {
  ATLAS_BOX,
  FLY_ZOOM_MAX,
  LABEL_ANCHOR,
  SMALL_STATES,
  STATE_MAP_FILL,
  clampView,
  fitView,
  flyView,
  isTap,
  markLayout,
  resolveTap,
  zoomOf,
} from "@/components/portal/state-map-geometry";
import { US_STATES, type UsStateCode } from "@/lib/us-states";

describe("snap resolution", () => {
  const snaps = [152, 380, 650];

  it("snaps a slow drag back to the nearest snap", () => {
    // 120px of slow drag up from peek ends nearer peek than detail.
    expect(resolveSnap(snaps, 0, 152 + 110, 0.2)).toBe(0);
    // Far enough that detail is nearer.
    expect(resolveSnap(snaps, 0, 300, 0.2)).toBe(1);
    expect(resolveSnap(snaps, 2, 610, -0.1)).toBe(2);
  });

  it("moves one snap in the direction of a hard fling, however short", () => {
    // An 80px flick in 20ms is 4px/ms upward.
    const flick = releaseVelocity([
      { t: 0, y: 700 },
      { t: 10, y: 660 },
      { t: 20, y: 620 },
    ]);
    expect(flick).toBe(-4);
    expect(resolveSnap(snaps, 0, 152 + 80, flick)).toBe(1);
    // Downward from full lands on detail, not peek, and never past the ends.
    expect(resolveSnap(snaps, 2, 640, 2)).toBe(1);
    expect(resolveSnap(snaps, 0, 150, 3)).toBe(0);
    expect(resolveSnap(snaps, 2, 660, -3)).toBe(2);
  });

  it("reads velocity from the last 80ms only", () => {
    const samples = [
      { t: 0, y: 0 },
      { t: 100, y: 400 },
      { t: 150, y: 400 },
      { t: 200, y: 400 },
    ];
    expect(releaseVelocity(samples)).toBe(0);
    expect(releaseVelocity([{ t: 0, y: 0 }])).toBe(0);
  });

  it("rubber-bands at 0.35 past the first and last snap", () => {
    expect(rubberBand(300, 152, 650)).toBe(300);
    expect(rubberBand(752, 152, 650)).toBeCloseTo(650 + 102 * 0.35);
    expect(rubberBand(52, 152, 650)).toBeCloseTo(152 - 100 * 0.35);
  });

  it("settles in 420ms, shortened toward 240ms for a hard fling", () => {
    expect(settleDuration(0)).toBe(SETTLE_MS);
    expect(settleDuration(0.5)).toBe(SETTLE_MS);
    expect(settleDuration(5)).toBe(FLING_SETTLE_MS);
    const mid = settleDuration(1.2);
    expect(mid).toBeLessThan(SETTLE_MS);
    expect(mid).toBeGreaterThan(FLING_SETTLE_MS);
  });
});

describe("camera", () => {
  // The old canvas frame: centre (487.5, 305), halves 530 by 340.
  const base = { x: -42.5, y: -35, w: 1060, h: 680 };
  const at = (cx: number, cy: number, zoom: number) => {
    const w = base.w / zoom;
    const h = base.h / zoom;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };
  const centre = (view: { x: number; y: number; w: number; h: number }) => ({
    x: view.x + view.w / 2,
    y: view.y + view.h / 2,
  });

  it("pins zoom 1 to the frame, whatever centre it is asked for", () => {
    expect(centre(clampView(at(900, 120, 1), base))).toEqual({ x: 487.5, y: 305 });
  });

  it("follows a centre inside the margin when zoomed", () => {
    expect(centre(clampView(at(600, 260, 2), base))).toEqual({ x: 600, y: 260 });
  });

  it("stops at the frame edge instead of panning off the atlas", () => {
    // Margin at zoom 2 is half of each half-frame: 265 and 170.
    expect(centre(clampView(at(1000, 20, 2), base))).toEqual({ x: 752.5, y: 135 });
  });

  it("clamps zoom to 1 through 8", () => {
    expect(zoomOf(clampView(at(487.5, 305, 20), base), base)).toBe(8);
    expect(zoomOf(clampView(at(487.5, 305, 0.5), base), base)).toBe(1);
  });

  it("lets a view travel further down by the covered height", () => {
    const covered = clampView(at(487.5, 600, 2), base, 100);
    expect(centre(covered).y).toBe(305 + 170 + 100);
  });

  it("fits the whole atlas bbox, Aleutians included, at the stage's aspect", () => {
    const wide = fitView(ATLAS_BOX, 2);
    expect(wide.w / wide.h).toBeCloseTo(2);
    expect(wide.x).toBeLessThanOrEqual(ATLAS_BOX[0]);
    expect(wide.x + wide.w).toBeGreaterThanOrEqual(ATLAS_BOX[2]);
    const tall = fitView(ATLAS_BOX, 360 / 364);
    expect(tall.w).toBeCloseTo(ATLAS_BOX[2] - ATLAS_BOX[0] + 12);
    expect(tall.y).toBeLessThanOrEqual(ATLAS_BOX[1]);
    expect(tall.y + tall.h).toBeGreaterThanOrEqual(ATLAS_BOX[3]);
  });

  it("flies to a state inside the visible part of the stage, zoom 1 to 6", () => {
    const stage = { w: 360, h: 364 };
    const frame = fitView(ATLAS_BOX, stage.w / stage.h);
    const ri = [896, 170.7, 910, 190.7] as const;
    const view = flyView(ri, frame, stage, 200);
    expect(zoomOf(view, frame)).toBeCloseTo(FLY_ZOOM_MAX);
    // RI's centre lands in the top 164px the sheet leaves, not under it.
    const scale = stage.w / view.w;
    const y = ((ri[1] + ri[3]) / 2 - view.y) * scale;
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(164);
  });
});

describe("labels", () => {
  const texas = [329, 357, 581, 604] as const;
  const delaware = [846, 250, 865, 282] as const;

  it("shows a code only where the state is at least 40px on its shorter side", () => {
    expect(markLayout(texas, LABEL_ANCHOR.TX[2], 0.36, false).label).toBe(true);
    expect(markLayout(delaware, LABEL_ANCHOR.DE[2], 0.36, false).label).toBe(false);
    // Zoomed in far enough, Delaware earns its label.
    expect(markLayout(delaware, LABEL_ANCHOR.DE[2], 3, false).label).toBe(true);
  });

  it("drops the badge where the state is smaller than the badge", () => {
    const rhodeIsland = [896, 170.7, 910, 190.7] as const;
    expect(markLayout(rhodeIsland, LABEL_ANCHOR.RI[2], 0.36, true).badge).toBe(false);
    expect(markLayout(rhodeIsland, LABEL_ANCHOR.RI[2], 2, true).badge).toBe(true);
  });

  it("pairs the code and the badge side by side, or stacked in a tall state", () => {
    const side = markLayout(texas, LABEL_ANCHOR.TX[2], 1, true);
    expect(side.labelAt).toEqual([-10, 0]);
    expect(side.badgeAt).toEqual([10, 0]);
    const california = [7, 190, 151, 437] as const;
    const stacked = markLayout(california, LABEL_ANCHOR.CA[2], 0.36, true);
    expect(stacked.label).toBe(true);
    expect(stacked.labelAt).toEqual([0, -9]);
    expect(stacked.badgeAt).toEqual([0, 9]);
  });

  it("anchors every state and lists the nine small ones", () => {
    expect(Object.keys(LABEL_ANCHOR)).toHaveLength(51);
    expect(SMALL_STATES).toEqual(["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD", "DC"]);
  });
});

describe("taps", () => {
  it("is a tap within 8px and a drag past it", () => {
    expect(isTap({ x: 200, y: 400 }, { x: 203, y: 404 })).toBe(true);
    expect(isTap({ x: 200, y: 400 }, { x: 200, y: 408 })).toBe(true);
    expect(isTap({ x: 200, y: 400 }, { x: 200, y: 409 })).toBe(false);
  });

  it("selects the one state within reach and clears on open map", () => {
    expect(resolveTap({ under: "TX", candidates: [{ code: "TX", distance: 20 }], zoom: 1 }))
      .toEqual({ type: "select", code: "TX" });
    expect(resolveTap({ under: null, candidates: [{ code: "ME", distance: 20 }], zoom: 1 }))
      .toEqual({ type: "select", code: "ME" });
    expect(resolveTap({ under: null, candidates: [], zoom: 3 })).toEqual({ type: "clear" });
  });

  it("zooms into a crowded tap instead of guessing", () => {
    expect(resolveTap({
      under: "CT",
      underSide: 11,
      candidates: [
        { code: "RI", distance: 10 },
        { code: "MA", distance: 20 },
      ],
      zoom: 1,
    })).toEqual({ type: "zoom", factor: 2.5 });
  });

  it("picks under the finger at zoom 4 and up, else the nearest", () => {
    const crowd = [
      { code: "RI" as UsStateCode, distance: 10 },
      { code: "MA" as UsStateCode, distance: 20 },
    ];
    expect(resolveTap({ under: "CT", underSide: 30, candidates: crowd, zoom: 4 }))
      .toEqual({ type: "select", code: "CT" });
    expect(resolveTap({ under: null, candidates: crowd, zoom: 6 }))
      .toEqual({ type: "select", code: "RI" });
  });

  it("takes a finger squarely on a 44px state at any zoom", () => {
    expect(resolveTap({
      under: "KS",
      underSide: 48,
      candidates: [{ code: "NE", distance: 20 }],
      zoom: 1,
    })).toEqual({ type: "select", code: "KS" });
  });
});

describe("StateMapSvg", () => {
  const states = US_STATES.map((state) => ({
    stateCode: state.code,
    stateName: state.name,
    status: state.code === "CA" ? "Pending" as const : state.code === "MT" ? "Inactive" as const : "Active" as const,
    createdAt: "",
    updatedAt: "",
  }));
  const props = {
    states,
    licensed: new Set<UsStateCode>(["TX"]),
    selected: "TX" as UsStateCode,
    filter: null,
    unavailable: false,
    loading: false,
    label: "PNCL availability map: 49 active, 1 pending, 1 inactive.",
    focus: null,
    occluded: 0,
    onPick: () => {},
    onClear: () => {},
  };

  afterEach(() => vi.restoreAllMocks());

  it("draws one labelled image of 51 pickable states with the selection on top", () => {
    const { container } = render(<StateMapSvg {...props} />);
    const map = screen.getByRole("img", { name: props.label });
    expect(map.querySelectorAll("path.smap-state[data-code]")).toHaveLength(51);
    expect(map.querySelector('path[data-code="CA"]')).toHaveAttribute("fill", "url(#smap-hatch)");
    expect(map.querySelector('path[data-code="MT"]')).toHaveAttribute("fill", STATE_MAP_FILL.Inactive);
    const layers = [...map.children].map((child) => child.getAttribute("class"));
    expect(layers.indexOf("smap-selected")).toBeGreaterThan(layers.indexOf("smap-states"));
    expect(container.querySelector(".smap-edges.is-dark")).not.toBeNull();
  });

  it("fades what the filter leaves out and goes neutral when availability failed", () => {
    const { rerender } = render(<StateMapSvg {...props} filter="Pending" />);
    const map = screen.getByRole("img");
    expect(map.querySelectorAll("path.smap-state[data-dim]")).toHaveLength(50);
    rerender(<StateMapSvg {...props} unavailable />);
    const fills = new Set([...map.querySelectorAll("path.smap-state")].map((path) => path.getAttribute("fill")));
    expect([...fills]).toEqual(["#3d4654"]);
  });

  it("zooms with the buttons and holds zoom 1 to 8", () => {
    // A 360 by 364 stage, and reduced motion so the camera jumps.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      { width: 360, height: 364, top: 0, left: 0, right: 360, bottom: 364, x: 0, y: 0, toJSON: () => ({}) },
    );
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);

    render(<StateMapSvg {...props} />);
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset zoom" })).toBeDisabled();

    for (let press = 0; press < 6; press += 1) fireEvent.click(zoomIn);
    expect(zoomIn).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(screen.getByRole("button", { name: "Reset zoom" })).toBeDisabled();
  });

  it("draws the bare outline with nothing to press while loading", () => {
    render(<StateMapSvg {...props} loading />);
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    expect(screen.getByRole("img").querySelectorAll("path[data-code]")).toHaveLength(0);
  });
});

describe("Segmented pill", () => {
  const items = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ];

  it("renders the sliding thumb only for a caller that asks for it", () => {
    const { container, rerender } = render(
      <Segmented items={items} value="a" onChange={() => {}} label="Pick" mode="radiogroup" />,
    );
    expect(container.querySelector(".portal-segmented-pill")).toBeNull();
    expect(container.querySelector(".portal-segmented")).not.toHaveClass("has-pill");

    rerender(<Segmented items={items} value="b" onChange={() => {}} label="Pick" mode="radiogroup" pill />);
    expect(container.querySelector(".portal-segmented-pill")).toHaveAttribute("aria-hidden", "true");
    // The thumb is not an item: arrow keys still move between the two radios.
    fireEvent.keyDown(screen.getByRole("radio", { name: "B" }), { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "A" }));
  });
});
