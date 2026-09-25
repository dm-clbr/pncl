import type { StateAvailabilityStatus } from "@/lib/portal-state-availability";
import type { UsStateCode } from "@/lib/us-states";

/* The state map's pure half: colours, the small-state list, label anchors and
   the camera and tap maths. Nothing here imports the atlas, so the page chunk
   can read the colours and the rail list without pulling the geometry in; the
   atlas is parsed once, at module scope, inside the lazy StateMapSvg chunk. */

/** Map fills, not the swatches in STATE_AVAILABILITY_META, which sit at 1.48:1
    (Active to Pending) and 2.31:1 (Active to Inactive) and merge for a viewer
    with deuteranopia or protanopia. These clear 3:1 against each other:
    Active to Inactive 3.16:1, Pending to Active 3.66:1, Pending to Inactive
    11.55:1. Active is #258258, a step darker than the canvas map's #27865a, so
    an 11px white label on it reads 4.76:1 instead of 4.52:1. Pending also
    carries a hatch and a licensed state a badge, so colour is never the only
    channel. */
export const STATE_MAP_FILL: Record<StateAvailabilityStatus, string> = {
  Active: "#258258",
  Pending: "#fbdf9d",
  Inactive: "#212730",
};

/** Every state when live availability failed: no status may be read off it. */
export const UNAVAILABLE_FILL = "#3d4654";
/** The Pending hatch, 4.79:1 on its own fill. */
export const HATCH_INK = "#7a5c14";
export const BADGE_RING = "#f4f0df";
export const BADGE_HALO = "#101318";
/** Label ink on the pale Pending fill (13.40:1); every other fill takes white. */
export const LABEL_INK_DARK = "#171a20";

/** A second, non-colour cue on each list row: a 3px bar in the status fill.
    Inactive's own fill is the card colour give or take, so its bar takes the
    mid grey the old swatch used and stays visible. */
export const ROW_ACCENT: Record<StateAvailabilityStatus, string> = {
  Active: STATE_MAP_FILL.Active,
  Pending: STATE_MAP_FILL.Pending,
  Inactive: "#596273",
};

export const isBrightFill = (status: StateAvailabilityStatus, unavailable: boolean) =>
  !unavailable && status !== "Inactive";

/** The nine states too small to tap at zoom 1 on a phone, north to south.
    Each has a shorter side under 50 atlas units, about 18px on a 360px map;
    everything else is at least 53 units and reaches 44px at zoom 2.5. */
export const SMALL_STATES: readonly UsStateCode[] = [
  "VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD", "DC",
];

/** Atlas bbox from us-atlas/states-albers-10m.json, rounded out. It runs to
    x -58 for the Aleutians, so 0 0 975 610 would clip them. */
export const ATLAS_BOX: Box = [-58, 13, 958, 607];
/** A few atlas units of air around the map at zoom 1. */
export const ATLAS_MARGIN = 6;

/** [x, y, r]: the pole of inaccessibility of each state's largest polygon in
    atlas units (the interior point farthest from an edge), and that distance.
    Precomputed once offline from the atlas rather than at runtime. The bbox
    centre falls outside FL, LA, MI and HI, and sits on the narrow neck of KY,
    VA and ID; the pole puts those six on their broad body without a hand
    offset. r is how much room the label has around the anchor. */
export const LABEL_ANCHOR: Record<UsStateCode, readonly [number, number, number]> = {
  AL: [674.1, 441, 31.5], AK: [106.4, 510, 32.8], AZ: [207.6, 390.7, 47.9],
  AR: [560.8, 392.2, 34.1], CA: [86.1, 317.9, 37.7], CO: [339.4, 290.7, 45.8],
  CT: [888.9, 188.9, 8.7], DE: [856.2, 266.7, 5], DC: [828.2, 267.5, 1],
  FL: [791.1, 535.1, 20], GA: [743.7, 438.7, 34.2], HI: [316.9, 586.6, 9.4],
  ID: [191.9, 163.2, 35.8], IL: [611.7, 266.9, 31.7], IN: [667.7, 273.7, 23.5],
  IA: [547.3, 227.8, 33.3], KS: [458.1, 309.1, 34.4], KY: [702.4, 315.6, 25.3],
  LA: [562.4, 457.3, 23.2], ME: [920.7, 91.4, 21.3], MD: [825.5, 257, 8.1],
  MA: [879.9, 173.9, 8], MI: [683.6, 200, 24], MN: [521.2, 115.2, 35.4],
  MS: [617.3, 418.3, 25.6], MO: [559.7, 317, 37.2], MT: [276.7, 99.3, 45.1],
  NE: [428.6, 239.5, 34.3], NV: [139.4, 239.7, 49.9], NH: [893.6, 150.2, 11.9],
  NJ: [863.2, 241.1, 8.7], NM: [312, 391.8, 55.7], NY: [844.3, 166.7, 25.6],
  NC: [818, 350.7, 25.9], ND: [437.2, 104, 34.5], OH: [720.2, 257.4, 30.4],
  OK: [483.9, 378.9, 35], OR: [109.8, 137.9, 42.4], PA: [811.7, 224.9, 26.1],
  RI: [903.2, 180.7, 3.5], SC: [786.4, 395.1, 24.5], SD: [411.4, 170.8, 33.5],
  TN: [665.6, 362.9, 19], TX: [455.9, 480.5, 65.1], UT: [228.1, 273.2, 43.6],
  VT: [871.2, 125.6, 10.9], VA: [810.5, 300.5, 24.8], WA: [134.6, 59.8, 34.7],
  WV: [758.7, 295.5, 19.1], WI: [595.3, 160.9, 31.3], WY: [315, 196, 45.5],
};

/* ── Path strings ─────────────────────────────────────────────────────────── */

export type Ring = readonly (readonly number[])[];

/** One ring or line as "M x y L x y ...", one decimal. The albers atlas is
    already projected with y pointing down, so the numbers go straight in. */
export const ringToPath = (ring: Ring, close: boolean) =>
  ring
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join("") + (close ? "Z" : "");

/* ── Camera ───────────────────────────────────────────────────────────────── */

/** [x0, y0, x1, y1] in atlas units. */
export type Box = readonly [number, number, number, number];
/** A viewBox: top-left corner and size, in atlas units. */
export type View = { x: number; y: number; w: number; h: number };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
/** A fly-to never goes past this, so a tiny state still shows its neighbours. */
export const FLY_ZOOM_MAX = 6;

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

/** The zoom 1 view: `box` plus `margin` on every side, grown along one axis
    to the stage's aspect so the viewBox never letterboxes. */
export function fitView(box: Box, aspect: number, margin = ATLAS_MARGIN): View {
  const [x0, y0, x1, y1] = box;
  let w = x1 - x0 + margin * 2;
  let h = y1 - y0 + margin * 2;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

/** How far a view is zoomed against the zoom 1 view. */
export const zoomOf = (view: View, base: View) => base.w / view.w;

/** Keeps a view inside the zoom 1 frame, zoomed between ZOOM_MIN and
    ZOOM_MAX: the old canvas's cameraCenter margin maths on a viewBox. At zoom
    1 the view is the frame itself; zoomed, its centre can travel half the
    spare width and height either way and no further, so the atlas never
    leaves the card. `extraBottom` (atlas units) lets it travel that much
    further down, for the part of the card a sheet covers: a state in the
    south can then still be lifted into the visible part. */
export function clampView(view: View, base: View, extraBottom = 0): View {
  const zoom = clamp(zoomOf(view, base), ZOOM_MIN, ZOOM_MAX);
  const w = base.w / zoom;
  const h = base.h / zoom;
  const cx = clamp(view.x + view.w / 2, base.x + w / 2, base.x + base.w - w / 2);
  const cy = clamp(view.y + view.h / 2, base.y + h / 2, base.y + base.h - h / 2 + extraBottom);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Zooms by `factor` keeping the atlas point (px, py) where it is on screen.
    Unclamped; run clampView after. */
export function zoomAround(view: View, factor: number, px: number, py: number): View {
  const w = view.w / factor;
  const h = view.h / factor;
  return {
    x: px - (px - view.x) / factor,
    y: py - (py - view.y) / factor,
    w,
    h,
  };
}

/** The fly-to target: fits `box` with `padding` px of air into the part of
    the stage the sheet leaves visible (the top `stageH - occluded` px),
    centred there, zoom between 1 and FLY_ZOOM_MAX, then clamped. */
export function flyView(
  box: Box,
  base: View,
  stage: { w: number; h: number },
  occluded = 0,
  padding = 24,
): View {
  const visibleH = Math.max(stage.h - occluded, stage.h * 0.25);
  const baseScale = stage.w / base.w;
  const fit = Math.min(
    (stage.w - padding * 2) / Math.max(box[2] - box[0], 1),
    (visibleH - padding * 2) / Math.max(box[3] - box[1], 1),
  );
  const scale = baseScale * clamp(fit / baseScale, ZOOM_MIN, FLY_ZOOM_MAX);
  const w = stage.w / scale;
  const h = stage.h / scale;
  const view = {
    x: (box[0] + box[2]) / 2 - w / 2,
    y: (box[1] + box[3]) / 2 - visibleH / 2 / scale,
    w,
    h,
  };
  return clampView(view, base, (stage.h - visibleH) / scale);
}

/* ── Labels ───────────────────────────────────────────────────────────────── */

/** Labels are 11px on screen at every zoom. A code shows only where the
    state's shorter on-screen side is at least 40px and the code clears the
    state's edge from its anchor, so every label sits inside its own state and
    two can never touch. The licensed badge is a constant 16px; it shows once
    the state is at least that big on screen, since below that it would sit on
    the neighbours (the small-state rail carries it there). When both show
    they pair up, side by side where the state has the room or is wider than
    tall, stacked where it is tall and narrow (California at zoom 1). Offsets
    are screen px from the anchor. */
export const LABEL_MIN_SIDE = 40;
export type MarkLayout = {
  label: boolean;
  badge: boolean;
  labelAt: readonly [number, number];
  badgeAt: readonly [number, number];
};
export function markLayout(box: Box, anchorRadius: number, scale: number, licensed: boolean): MarkLayout {
  const width = (box[2] - box[0]) * scale;
  const height = (box[3] - box[1]) * scale;
  const room = anchorRadius * scale;
  const label = Math.min(width, height) >= LABEL_MIN_SIDE && room >= 10;
  const badge = licensed && Math.min(width, height) >= 16;
  if (!label || !badge) return { label, badge, labelAt: [0, 0], badgeAt: [0, 0] };
  return room >= 18 || width >= height
    ? { label, badge, labelAt: [-10, 0], badgeAt: [10, 0] }
    : { label, badge, labelAt: [0, -9], badgeAt: [0, 9] };
}

/* ── Taps ─────────────────────────────────────────────────────────────────── */

/** The slop a finger leaves on a deliberate tap, in CSS pixels. */
export const TAP_SLOP = 8;

/** A tap rather than the start of a drag: a drag must never be a pick. */
export const isTap = (down: { x: number; y: number }, up: { x: number; y: number }) =>
  Math.hypot(up.x - down.x, up.y - down.y) <= TAP_SLOP;

/** Radius the fat-finger check samples around a tap, in CSS pixels. */
export const TAP_RADIUS = 20;
/** At or past this zoom a crowded tap picks instead of zooming again. */
export const TAP_PICK_ZOOM = 4;
/** How far a crowded tap zooms in. */
export const TAP_ZOOM_FACTOR = 2.5;

export type TapCandidate = { code: UsStateCode; distance: number };
export type TapAction =
  | { type: "select"; code: UsStateCode }
  | { type: "zoom"; factor: number }
  | { type: "clear" };

/** What a tap does, from the states found within TAP_RADIUS of it. No state:
    the tap was on open map and clears the selection. One state: that one.
    Several: below TAP_PICK_ZOOM the map zooms into the tap instead of
    guessing, and from there the state under the finger wins, else the
    nearest. One refinement: a finger squarely on a state whose shorter side
    is already 44px on screen is not a guess, so that state is picked at any
    zoom, which keeps every state outside the small-state rail within two
    taps of load. */
export function resolveTap({
  under,
  underSide = 0,
  candidates,
  zoom,
}: {
  /** The state directly under the finger, if any. */
  under: UsStateCode | null;
  /** That state's shorter on-screen side, px. */
  underSide?: number;
  candidates: readonly TapCandidate[];
  zoom: number;
}): TapAction {
  const nearest = new Map<UsStateCode, number>();
  if (under) nearest.set(under, 0);
  for (const { code, distance } of candidates) {
    nearest.set(code, Math.min(distance, nearest.get(code) ?? Infinity));
  }
  if (nearest.size === 0) return { type: "clear" };
  if (nearest.size === 1) return { type: "select", code: nearest.keys().next().value as UsStateCode };
  if (under && underSide >= 44) return { type: "select", code: under };
  if (zoom < TAP_PICK_ZOOM) return { type: "zoom", factor: TAP_ZOOM_FACTOR };
  if (under) return { type: "select", code: under };
  const [code] = [...nearest].sort((a, b) => a[1] - b[1])[0];
  return { type: "select", code };
}
