import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { feature, mesh } from "topojson-client";
import statesAtlas from "us-atlas/states-albers-10m.json";
import type { GeometryCollection, GeometryObject, Topology } from "topojson-specification";
import type { FeatureCollection, MultiLineString, MultiPolygon, Polygon } from "geojson";
import Chip from "@/components/portal/Chip";
import { LicenseGlyph, STATUS_CHIP } from "@/components/portal/StateDetail";
import { matchesFilter, type StateMapFilter } from "@/components/portal/state-map-filter";
import {
  ATLAS_BOX,
  BADGE_HALO,
  BADGE_RING,
  HATCH_INK,
  LABEL_ANCHOR,
  LABEL_INK_DARK,
  STATE_MAP_FILL,
  TAP_RADIUS,
  UNAVAILABLE_FILL,
  ZOOM_MAX,
  ZOOM_MIN,
  clampView,
  fitView,
  flyView,
  isBrightFill,
  isTap,
  markLayout,
  resolveTap,
  ringToPath,
  zoomAround,
  zoomOf,
  type Box,
  type TapCandidate,
  type View,
} from "@/components/portal/state-map-geometry";
import type { StateAvailability, StateAvailabilityStatus } from "@/lib/portal-state-availability";
import { US_STATE_BY_FIPS, type UsStateCode } from "@/lib/us-states";

/* ── The atlas, parsed once when this lazy chunk loads ──────────────────────
   9,348 points. us-atlas's albers file is pre-projected with y pointing down,
   so topojson-client's feature() output becomes path strings directly: no d3,
   no projection, no WebGL. */

type Shape = { code: UsStateCode; name: string; d: string; box: Box };

const topology = statesAtlas as unknown as Topology<{ states: GeometryCollection }>;

const SHAPES: Shape[] = (
  feature(topology, topology.objects.states) as unknown as FeatureCollection<Polygon | MultiPolygon>
).features.flatMap((stateFeature) => {
  const definition = US_STATE_BY_FIPS.get(String(stateFeature.id ?? "").padStart(2, "0"));
  if (!definition || !stateFeature.geometry) return [];
  const polygons = stateFeature.geometry.type === "Polygon"
    ? [stateFeature.geometry.coordinates]
    : stateFeature.geometry.coordinates;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const parts: string[] = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      parts.push(ringToPath(ring, true));
      for (const [x, y] of ring) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  return [{ code: definition.code, name: definition.name, d: parts.join(""), box: [x0, y0, x1, y1] as const }];
});

const SHAPE_BY_CODE = new Map(SHAPES.map((shape) => [shape.code, shape]));

const codeOf = (object: GeometryObject) =>
  US_STATE_BY_FIPS.get(String(object.id ?? "").padStart(2, "0"))?.code;

/** One path for a set of borders: topojson's mesh() walks each shared arc
    once, so a border is drawn once rather than by both neighbours. */
const meshPath = (keep: (a: GeometryObject, b: GeometryObject) => boolean) =>
  (mesh(topology, topology.objects.states, keep) as unknown as MultiLineString).coordinates
    .map((line) => ringToPath(line, false))
    .join("");

/* ── Motion ─────────────────────────────────────────────────────────────── */

/** --portal-ease-out, cubic-bezier(0.22, 1, 0.36, 1), for the rAF tween. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (x: number) => {
    let t = x;
    for (let step = 0; step < 8; step += 1) {
      const error = ((ax * t + bx) * t + cx) * t - x;
      const slope = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(error) < 1e-5 || slope === 0) break;
      t = Math.min(1, Math.max(0, t - error / slope));
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
const EASE_OUT = bezier(0.22, 1, 0.36, 1);
const FLY_MS = 380;
const ZOOM_STEP = 1.6;
const HATCH_PITCH_PX = 6;
const HATCH_ID = "smap-hatch";

const reducedMotion = () =>
  typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type StateMapSvgProps = {
  states: readonly StateAvailability[];
  licensed: ReadonlySet<UsStateCode>;
  selected: UsStateCode | null;
  filter: StateMapFilter | null;
  /** Live availability failed: every state takes the neutral fill. */
  unavailable: boolean;
  /** Availability is still loading: the outline alone, nothing to press. */
  loading: boolean;
  /** The map's accessible name, with the counts. */
  label: string;
  /** A pick to fly to. A new `n` flies, even back to the same state. */
  focus: { code: UsStateCode; n: number } | null;
  /** Px of the stage's bottom the phone sheet covers; fly-to centres above. */
  occluded: number;
  onPick: (code: UsStateCode) => void;
  /** A tap on open map. */
  onClear: () => void;
};

/** The state map as inline SVG. Crisp at native dpr, hit-tested by the DOM,
    labelled in real text, and three.js-free. The camera is the viewBox:
    pan and zoom move its four numbers, clamped to the card, zoom 1 to 8, so
    hit-testing stays in atlas space (after the Motion "SVG viewBox" demo on
    21st.dev). Pinch zooms around its midpoint, one finger pans once zoomed,
    ctrl or cmd plus wheel zooms at the cursor and a plain wheel scrolls the
    page. Every stroke is non-scaling; labels and badges keep one on-screen
    size by setting their size from the current scale, and hide while the
    camera moves. Region labels tiered by on-screen size and the readout
    parked beside the hovered state after the ssych ui Market Heatmap. */
export default function StateMapSvg({
  states,
  licensed,
  selected,
  filter,
  unavailable,
  loading,
  label,
  focus,
  occluded,
  onPick,
  onClear,
}: StateMapSvgProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const base = useMemo(() => (size ? fitView(ATLAS_BOX, size.w / size.h) : null), [size]);
  const baseRef = useRef(base);
  const viewRef = useRef<View | null>(null);
  // The view labels, badges, the hatch and the zoom buttons are drawn for.
  // Updated when the camera comes to rest, never per frame.
  const [settled, setSettled] = useState<View | null>(null);
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const [hover, setHover] = useState<UsStateCode | null>(null);

  const statusOf = useMemo(
    () => new Map(states.map((state) => [state.stateCode, state.status])),
    [states],
  );

  const applyView = (view: View) => {
    viewRef.current = view;
    svgRef.current?.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  };
  const startMotion = () => {
    if (movingRef.current) return;
    movingRef.current = true;
    setMoving(true);
    setHover(null);
  };
  const settle = () => {
    movingRef.current = false;
    setMoving(false);
    setSettled(viewRef.current);
  };
  const stopTween = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };

  /** Moves the camera to `target`: a 380ms rAF tween of the four viewBox
      numbers on --portal-ease-out (WAAPI cannot animate an attribute), or a
      jump under reduced motion. */
  const tweenTo = useCallback((target: View) => {
    stopTween();
    const from = viewRef.current;
    if (!from || reducedMotion()) {
      applyView(target);
      settle();
      return;
    }
    startMotion();
    const start = performance.now();
    const frame = (now: number) => {
      const eased = EASE_OUT(Math.min(1, (now - start) / FLY_MS));
      applyView({
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        w: from.w + (target.w - from.w) * eased,
        h: from.h + (target.h - from.h) * eased,
      });
      if (eased < 1 && now - start < FLY_MS) frameRef.current = requestAnimationFrame(frame);
      else {
        frameRef.current = null;
        applyView(target);
        settle();
      }
    };
    frameRef.current = requestAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stage size. On a resize the zoom and the centre carry over to the new
  // frame, clamped to it; the first measurement starts at zoom 1.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      setSize((current) => (current && current.w === width && current.h === height ? current : { w: width, h: height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!base) return;
    const previous = baseRef.current;
    const current = viewRef.current;
    baseRef.current = base;
    stopTween();
    if (!previous || !current) {
      applyView(base);
    } else {
      const zoom = zoomOf(current, previous);
      const cx = current.x + current.w / 2;
      const cy = current.y + current.h / 2;
      const w = base.w / zoom;
      const h = base.h / zoom;
      applyView(clampView({ x: cx - w / 2, y: cy - h / 2, w, h }, base));
    }
    settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  /* Fly-to. A new pick flies; a change to the covered height within the
     next 700ms re-aims the same flight, because the sheet measures its
     detail height one frame after the pick that opened it. */
  const lastFocus = useRef({ n: -1, at: 0 });
  useEffect(() => {
    if (!focus || !base || !size) return;
    if (focus.n !== lastFocus.current.n) lastFocus.current = { n: focus.n, at: performance.now() };
    else if (performance.now() - lastFocus.current.at > 700) return;
    const shape = SHAPE_BY_CODE.get(focus.code);
    if (shape) tweenTo(flyView(shape.box, base, size, occluded));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n, occluded, base]);

  useEffect(() => stopTween, []);

  /* ── Pointer gestures ─────────────────────────────────────────────────── */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    kind: "press" | "pan" | "pinch";
    view: View;
    x: number;
    y: number;
    distance: number;
    tapId: number | null;
  } | null>(null);

  const extraBottom = (view: View) => (size ? occluded * (view.w / size.w) : 0);
  const clampLive = (view: View) => (base ? clampView(view, base, extraBottom(view)) : view);

  const hitCode = (x: number, y: number): UsStateCode | null => {
    const svg = svgRef.current;
    if (!svg || typeof document.elementsFromPoint !== "function") return null;
    for (const element of document.elementsFromPoint(x, y)) {
      if (element instanceof SVGPathElement && svg.contains(element) && element.dataset.code) {
        return element.dataset.code as UsStateCode;
      }
    }
    return null;
  };

  /** Fat finger: the state under the tap plus whatever lies on two rings
      around it, 10 and 20px out, eight samples each. */
  const handleTap = (x: number, y: number) => {
    const view = viewRef.current;
    if (!view || !base || !size) return;
    const scale = size.w / view.w;
    const under = hitCode(x, y);
    const candidates: TapCandidate[] = [];
    for (const radius of [TAP_RADIUS / 2, TAP_RADIUS]) {
      for (let step = 0; step < 8; step += 1) {
        const angle = (step / 8) * Math.PI * 2;
        const code = hitCode(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
        if (code) candidates.push({ code, distance: radius });
      }
    }
    const underBox = under ? SHAPE_BY_CODE.get(under)?.box : undefined;
    const action = resolveTap({
      under,
      underSide: underBox ? Math.min(underBox[2] - underBox[0], underBox[3] - underBox[1]) * scale : 0,
      candidates,
      zoom: zoomOf(view, base),
    });
    if (action.type === "select") onPick(action.code);
    else if (action.type === "clear") onClear();
    else {
      const rect = stageRef.current!.getBoundingClientRect();
      const ax = view.x + (x - rect.left) / scale;
      const ay = view.y + (y - rect.top) / scale;
      tweenTo(clampLive(zoomAround(view, action.factor, ax, ay)));
    }
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (loading || !viewRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 1) {
      gesture.current = {
        kind: "press",
        view: viewRef.current,
        x: event.clientX,
        y: event.clientY,
        distance: 0,
        tapId: event.pointerId,
      };
    } else if (points.length === 2) {
      stopTween();
      startMotion();
      const [a, b] = points;
      gesture.current = {
        kind: "pinch",
        view: viewRef.current,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        tapId: null,
      };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!pointers.current.has(event.pointerId) || !current) {
      // Hover readout, fine pointers only: on touch it would fire on the tap
      // that already selects and linger.
      if (event.pointerType === "mouse" && !movingRef.current) {
        setHover(hitCode(event.clientX, event.clientY));
      }
      return;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !size || !base) return;

    if (current.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const factor = Math.hypot(a.x - b.x, a.y - b.y) / current.distance;
      const scale0 = size.w / current.view.w;
      // The atlas point under the starting midpoint stays under the fingers.
      const ax = current.view.x + (current.x - rect.left) / scale0;
      const ay = current.view.y + (current.y - rect.top) / scale0;
      const zoomed = clampView(zoomAround(current.view, factor, ax, ay), base);
      const scale = size.w / zoomed.w;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      applyView(clampLive({
        ...zoomed,
        x: zoomed.x - (midX - current.x) / scale,
        y: zoomed.y - (midY - current.y) / scale,
      }));
      return;
    }

    const moved = !isTap({ x: current.x, y: current.y }, { x: event.clientX, y: event.clientY });
    if (current.kind === "press" && moved) {
      current.tapId = null;
      if (zoomOf(current.view, base) <= ZOOM_MIN + 1e-3) return;
      current.kind = "pan";
      stopTween();
      startMotion();
    }
    if (current.kind === "pan") {
      const scale = size.w / current.view.w;
      applyView(clampLive({
        ...current.view,
        x: current.view.x - (event.clientX - current.x) / scale,
        y: current.view.y - (event.clientY - current.y) / scale,
      }));
    }
  };

  const release = (event: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) => {
    const current = gesture.current;
    const start = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (!current || !start) return;
    if (
      !cancelled
      && current.kind === "press"
      && current.tapId === event.pointerId
      && isTap({ x: current.x, y: current.y }, { x: event.clientX, y: event.clientY })
    ) {
      gesture.current = null;
      handleTap(event.clientX, event.clientY);
      return;
    }
    const left = [...pointers.current.values()];
    if (left.length === 1 && viewRef.current) {
      // Lifting one finger of a pinch carries on as a pan from the other.
      gesture.current = { kind: "pan", view: viewRef.current, x: left[0].x, y: left[0].y, distance: 0, tapId: null };
      return;
    }
    if (left.length === 0) {
      gesture.current = null;
      if (movingRef.current && frameRef.current === null) settle();
    }
  };

  // ctrl or cmd plus wheel zooms at the cursor, which is also how a trackpad
  // pinch arrives. A plain wheel is left alone so it scrolls the page.
  // Registered by hand: React's wheel listener is passive.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || loading) return;
    let rest: number | null = null;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const view = viewRef.current;
      const frame = baseRef.current;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!view || !frame || !rect) return;
      event.preventDefault();
      stopTween();
      startMotion();
      const scale = rect.width / view.w;
      const factor = Math.min(2, Math.max(0.5, Math.exp(-event.deltaY * 0.01)));
      const ax = view.x + (event.clientX - rect.left) / scale;
      const ay = view.y + (event.clientY - rect.top) / scale;
      applyView(clampView(zoomAround(view, factor, ax, ay), frame));
      if (rest !== null) window.clearTimeout(rest);
      rest = window.setTimeout(settle, 160);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
      if (rest !== null) window.clearTimeout(rest);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, size !== null]);

  /* ── Zoom buttons: the single-pointer path (WCAG 2.5.1) ───────────────── */

  const zoomBy = (factor: number) => {
    const view = viewRef.current;
    if (!view || !base || !size) return;
    const scale = size.w / view.w;
    // Around the middle of what the sheet leaves visible.
    const ax = view.x + size.w / 2 / scale;
    const ay = view.y + Math.max(size.h - occluded, 0) / 2 / scale;
    tweenTo(clampLive(zoomAround(view, factor, ax, ay)));
  };
  const zoom = settled && base ? zoomOf(settled, base) : 1;

  /* ── Drawing ──────────────────────────────────────────────────────────── */

  const fillOf = (code: UsStateCode) => {
    const status = statusOf.get(code) ?? "Inactive";
    if (loading) return "rgba(255, 255, 255, 0.06)";
    if (unavailable) return UNAVAILABLE_FILL;
    return status === "Pending" ? `url(#${HATCH_ID})` : STATE_MAP_FILL[status];
  };
  const bright = (object: GeometryObject) => {
    const code = codeOf(object);
    return code ? isBrightFill(statusOf.get(code) ?? "Inactive", unavailable) : false;
  };

  // One edge colour cannot serve every fill: they sit more than 3:1 apart, so
  // any single tone lands inside 3:1 of one of them. A border touching a
  // bright state takes the dark etched edge; one between two dark states, and
  // a dark state's coastline, takes the light one so it keeps a silhouette.
  const edges = useMemo(() => {
    if (loading) return { dark: "", light: "" };
    return {
      dark: meshPath((a, b) => a !== b && (bright(a) || bright(b))),
      light: meshPath((a, b) => (a === b ? !bright(a) : !bright(a) && !bright(b))),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusOf, unavailable, loading]);

  const statesLayer = useMemo(
    () => SHAPES.map((shape) => {
      const status = statusOf.get(shape.code) ?? "Inactive";
      const kept = matchesFilter(filter, status, licensed.has(shape.code));
      return (
        <path
          key={shape.code}
          className="smap-state"
          d={shape.d}
          fill={fillOf(shape.code)}
          data-code={loading ? undefined : shape.code}
          data-dim={!loading && !kept ? "true" : undefined}
        />
      );
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusOf, filter, licensed, unavailable, loading],
  );

  const scale = settled && size ? size.w / settled.w : 1;

  const marks = useMemo(() => {
    if (loading || !settled) return null;
    return SHAPES.map((shape) => {
      const [ax, ay, room] = LABEL_ANCHOR[shape.code];
      const status: StateAvailabilityStatus = statusOf.get(shape.code) ?? "Inactive";
      const isLicensed = licensed.has(shape.code);
      const layout = markLayout(shape.box, room, scale, isLicensed);
      if (!layout.label && !layout.badge) return null;
      const kept = matchesFilter(filter, status, isLicensed);
      const fill = unavailable ? UNAVAILABLE_FILL : STATE_MAP_FILL[status];
      return (
        <g key={shape.code} data-dim={!kept ? "true" : undefined}>
          {layout.label && (
            <text
              x={ax + layout.labelAt[0] / scale}
              y={ay + layout.labelAt[1] / scale}
              fontSize={11 / scale}
              strokeWidth={3 / scale}
              fill={!unavailable && status === "Pending" ? LABEL_INK_DARK : "#ffffff"}
              stroke={fill}
            >
              {shape.code}
            </text>
          )}
          {layout.badge && (
            <g transform={`translate(${ax + layout.badgeAt[0] / scale} ${ay + layout.badgeAt[1] / scale}) scale(${1 / scale})`}>
              <circle r="8" fill={BADGE_HALO} />
              <circle r="5.4" fill="none" stroke={BADGE_RING} strokeWidth="1.6" />
              <path d="M-2.6 0.2 -0.8 2 2.8-1.8" fill="none" stroke={BADGE_RING} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )}
        </g>
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, statusOf, licensed, filter, unavailable, loading, scale]);

  const selectedShape = selected ? SHAPE_BY_CODE.get(selected) : undefined;
  const hoverShape = hover && hover !== selected ? SHAPE_BY_CODE.get(hover) : undefined;
  const hatchPitch = HATCH_PITCH_PX / scale;

  // The readout parks beside the hovered state's anchor, flips left near the
  // right edge and above near the bottom, and never leaves the card.
  let readout: { left: number; top: number; state: StateAvailability } | null = null;
  if (hover && settled && size && !moving) {
    const state = states.find((item) => item.stateCode === hover);
    if (state) {
      const [ax, ay] = LABEL_ANCHOR[hover];
      const px = (ax - settled.x) * scale;
      const py = (ay - settled.y) * scale;
      let left = px + 18;
      if (left + 168 > size.w) left = px - 18 - 160;
      let top = py - 22;
      if (top + 56 > size.h) top = py - 64;
      readout = {
        left: Math.min(Math.max(left, 8), size.w - 168),
        top: Math.min(Math.max(top, 8), size.h - 56),
        state,
      };
    }
  }

  return (
    <div className="smap-viz" data-moving={moving ? "true" : undefined} data-loading={loading ? "true" : undefined}>
      {!loading && (
        <div className="smap-zoom">
          <div className="smap-zoom-pair" role="group" aria-label="Map zoom">
            <button type="button" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX - 1e-3} onClick={() => zoomBy(ZOOM_STEP)}>
              <Plus size={18} strokeWidth={2} aria-hidden="true" />
            </button>
            <span className="smap-zoom-divider" aria-hidden="true" />
            <button type="button" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN + 1e-3} onClick={() => zoomBy(1 / ZOOM_STEP)}>
              <Minus size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="smap-zoom-reset"
            aria-label="Reset zoom"
            disabled={zoom <= ZOOM_MIN + 1e-3}
            onClick={() => base && tweenTo(base)}
          >
            <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}

      <div ref={stageRef} className="smap-stage" translate="no">
        <svg
          ref={svgRef}
          className="smap-svg"
          role="img"
          aria-label={label}
          focusable="false"
          viewBox={base ? `${base.x} ${base.y} ${base.w} ${base.h}` : "-64 7 1028 606"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => release(event, false)}
          onPointerCancel={(event) => release(event, true)}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            {/* Reset on zoom end so the stripes stay about 6px apart on screen. */}
            <pattern id={HATCH_ID} patternUnits="userSpaceOnUse" width={hatchPitch} height={hatchPitch} patternTransform="rotate(45)">
              <rect width={hatchPitch} height={hatchPitch} fill={STATE_MAP_FILL.Pending} />
              <rect width={hatchPitch * 0.38} height={hatchPitch} fill={HATCH_INK} />
            </pattern>
          </defs>
          <g className="smap-states">{statesLayer}</g>
          {edges.dark && <path className="smap-edges is-dark" d={edges.dark} />}
          {edges.light && <path className="smap-edges is-light" d={edges.light} />}
          {hoverShape && <path className="smap-hover" d={hoverShape.d} />}
          {/* Last, so no neighbour's edge draws over it. */}
          {selectedShape && !loading && <path className="smap-selected" d={selectedShape.d} />}
          <g className="smap-marks">{marks}</g>
        </svg>

        {readout && (
          <div className="smap-readout" role="status" style={{ left: readout.left, top: readout.top }}>
            <span className="smap-readout-name">{readout.state.stateName}</span>
            <span className="smap-readout-facts">
              {unavailable ? (
                <Chip>Unavailable</Chip>
              ) : (
                <Chip variant={STATUS_CHIP[readout.state.status]}>{readout.state.status}</Chip>
              )}
              {licensed.has(readout.state.stateCode) && (
                <span className="smap-readout-licensed">
                  <LicenseGlyph licensed />
                  Licensed
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
