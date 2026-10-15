import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

/* Snap maths, pure so they can be checked without a touch screen. Heights are
   the sheet's visible height in px; velocity is px/ms with + meaning the
   finger moved down (the sheet shrinking). */

/** A release faster than this moves one snap in the direction of travel. */
export const FLING_VELOCITY = 0.5;
/** How far past the first and last snap the sheet follows the finger. */
export const RUBBER_BAND = 0.35;
/** Settle time for a gentle release, and the floor a hard fling shortens to. */
export const SETTLE_MS = 420;
export const FLING_SETTLE_MS = 240;

/** Velocity over the last `windowMs` of pointer samples. Two samples minimum;
    an old flick that stopped before the release reads as 0. */
export function releaseVelocity(
  samples: readonly { t: number; y: number }[],
  windowMs = 80,
): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[samples.length - 2];
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    if (last.t - samples[index].t > windowMs) break;
    first = samples[index];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

/** Past either end the sheet moves at RUBBER_BAND of the finger. */
export function rubberBand(height: number, min: number, max: number, factor = RUBBER_BAND) {
  if (height < min) return min - (min - height) * factor;
  if (height > max) return max + (height - max) * factor;
  return height;
}

/** Where a release lands. A fling moves one snap from where the drag started,
    in its direction; otherwise the snap nearest the released height wins, so
    a slow drag that did not get far snaps back. Snaps ascend. */
export function resolveSnap(
  snaps: readonly number[],
  startIndex: number,
  height: number,
  velocity: number,
): number {
  if (Math.abs(velocity) > FLING_VELOCITY) {
    const step = velocity < 0 ? 1 : -1;
    return Math.min(Math.max(startIndex + step, 0), snaps.length - 1);
  }
  let best = 0;
  snaps.forEach((snap, index) => {
    if (Math.abs(snap - height) < Math.abs(snaps[best] - height)) best = index;
  });
  return best;
}

/** 420ms for a settle, shortened toward 240ms the harder the fling. */
export const settleDuration = (velocity: number) =>
  Math.round(SETTLE_MS - Math.min(1, Math.max(0, Math.abs(velocity) - FLING_VELOCITY) / 1.5) * (SETTLE_MS - FLING_SETTLE_MS));

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Movement before a press on the header becomes a drag rather than a tap. */
const DRAG_SLOP = 6;

type SnapSheetProps = {
  /** Names the section landmark. */
  label: string;
  /** Visible heights, ascending, px. The last is the sheet's full height. */
  snaps: readonly number[];
  index: number;
  onIndexChange: (index: number) => void;
  /** The grabber button's state and name: aria-expanded and "Show less" at
      full, "Show all states" and collapsed otherwise. */
  expanded: boolean;
  grabberLabel: string;
  onGrabber: () => void;
  children: ReactNode;
};

/** A persistent, non-modal bottom sheet with snap points. Styles under
    .snap-sheet in src/styles/portal-primitives.css; the caller places it
    (fixed, above the bottom nav) and sets its full height through `top`.

    The panel renders at full height and moves by transform only: no
    transition while a finger drives it, a WAAPI settle on release, never an
    animated height. Drags start on the grabber or anywhere marked
    [data-sheet-handle]. Inside [data-sheet-scroll] a downward drag that starts
    with the list at the top becomes a sheet drag and anything else scrolls the
    list; that handoff runs on touch events, because once the browser starts a
    pan it cancels the pointer events for good. The grabber is a real button
    that cycles collapsed and full on a tap or Enter, the non-dragging path for
    WCAG 2.5.7. A labelled <section>, never a dialog: it traps nothing and locks
    nothing. Snaps are instant under reduced motion.

    Drag and snap model after the coss.com Drawer, snap points variant
    (21st.dev): full-height panel on translateY, velocity over distance. The
    contained list scroll is BeUI Bottom Sheet's overscroll-behavior. */
export default function SnapSheet({
  label,
  snaps,
  index,
  onIndexChange,
  expanded,
  grabberLabel,
  onGrabber,
  children,
}: SnapSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const full = snaps[snaps.length - 1] ?? 0;
  // The offset the panel sits at right now, px down from fully open. Read
  // from here rather than the DOM, except when a settle is interrupted.
  const offsetRef = useRef(full - (snaps[index] ?? 0));
  const animationRef = useRef<Animation | null>(null);
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    startIndex: number;
    samples: { t: number; y: number }[];
    active: boolean;
    pointerId?: number;
  } | null>(null);
  const draggedRef = useRef(false);
  const snapsRef = useRef(snaps);
  snapsRef.current = snaps;
  const indexRef = useRef(index);
  indexRef.current = index;

  const reducedMotion = () =>
    typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const place = (offset: number) => {
    offsetRef.current = offset;
    sheetRef.current?.style.setProperty("transform", `translateY(${offset}px)`);
  };

  /** Where the panel actually is, mid-settle included, and stops the settle. */
  const liveOffset = () => {
    const sheet = sheetRef.current;
    const animation = animationRef.current;
    if (sheet && animation) {
      const matrix = getComputedStyle(sheet).transform;
      const match = /matrix.*\((.+)\)/.exec(matrix);
      const values = match?.[1].split(",").map(Number);
      if (values) offsetRef.current = values.length === 6 ? values[5] : values[13];
      animation.cancel();
      animationRef.current = null;
      place(offsetRef.current);
    }
    return offsetRef.current;
  };

  const settle = useCallback((target: number, velocity = 0) => {
    const sheet = sheetRef.current;
    const from = liveOffset();
    place(target);
    if (!sheet || from === target || reducedMotion() || typeof sheet.animate !== "function") return;
    animationRef.current = sheet.animate(
      [{ transform: `translateY(${from}px)` }, { transform: `translateY(${target}px)` }],
      { duration: settleDuration(velocity), easing: EASE_OUT },
    );
    animationRef.current.onfinish = () => {
      animationRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A snap chosen from outside (a pick, a focus, the grabber) or a snap that
  // moved because the content under it changed height settles to its place.
  useLayoutEffect(() => {
    if (dragRef.current?.active) return;
    const target = full - (snaps[index] ?? 0);
    if (animationRef.current === null && offsetRef.current === target) {
      place(target);
      return;
    }
    settle(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, full, snaps[index]]);

  const begin = (y: number) => {
    const current = snapsRef.current;
    const top = current[current.length - 1] ?? 0;
    dragRef.current = {
      startY: y,
      startHeight: top - liveOffset(),
      startIndex: indexRef.current,
      samples: [{ t: performance.now(), y }],
      active: true,
    };
    sheetRef.current?.setAttribute("data-dragging", "");
  };

  const move = (y: number) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    const current = snapsRef.current;
    const top = current[current.length - 1] ?? 0;
    const height = rubberBand(drag.startHeight - (y - drag.startY), current[0] ?? 0, top);
    place(top - height);
    drag.samples.push({ t: performance.now(), y });
    if (drag.samples.length > 12) drag.samples.shift();
  };

  const end = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    sheetRef.current?.removeAttribute("data-dragging");
    if (!drag?.active) return;
    const current = snapsRef.current;
    const top = current[current.length - 1] ?? 0;
    const velocity = releaseVelocity(drag.samples);
    const next = resolveSnap(current, drag.startIndex, top - offsetRef.current, velocity);
    settle(top - current[next], velocity);
    if (next !== indexRef.current) onIndexChange(next);
  };

  /* Pointer path: the grabber and the header. The header holds the search
     field, so a press there waits for DRAG_SLOP of vertical travel before it
     becomes a drag, and a plain tap still focuses the field. */
  const pending = useRef<{ id: number; x: number; y: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (!target.closest(".snap-sheet-grabber, [data-sheet-handle]")) return;
    draggedRef.current = false;
    pending.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const press = pending.current;
    if (press && press.id === event.pointerId && !dragRef.current) {
      const dy = event.clientY - press.y;
      const dx = event.clientX - press.x;
      if (Math.abs(dy) < DRAG_SLOP || Math.abs(dy) < Math.abs(dx)) return;
      begin(press.y);
      draggedRef.current = true;
      dragRef.current!.pointerId = event.pointerId;
      sheetRef.current?.setPointerCapture?.(event.pointerId);
      // A drag that started on the search field is a drag, not an edit.
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    if (dragRef.current?.pointerId === event.pointerId) move(event.clientY);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (pending.current?.id === event.pointerId) pending.current = null;
    if (dragRef.current?.pointerId === event.pointerId) end();
  };

  /* Touch path: the list's scroll handoff. Registered by hand because React
     attaches touchmove as passive, and a passive listener cannot stop the
     browser from scrolling the list once the drag has become the sheet's. */
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    let touch: { id: number; y: number; atTop: boolean; scroller: HTMLElement } | null = null;
    let handoff = false;

    const onStart = (event: TouchEvent) => {
      const scroller = (event.target as HTMLElement).closest<HTMLElement>("[data-sheet-scroll]");
      if (!scroller || event.touches.length !== 1) {
        touch = null;
        return;
      }
      const point = event.touches[0];
      touch = { id: point.identifier, y: point.clientY, atTop: scroller.scrollTop <= 0, scroller };
      handoff = false;
    };
    const onMove = (event: TouchEvent) => {
      if (!touch) return;
      const point = [...event.changedTouches].find((item) => item.identifier === touch?.id);
      if (!point) return;
      if (!handoff) {
        // Decided on the first move: down from the top of the list is the
        // sheet's, anything else stays a scroll for the whole gesture.
        if (touch.atTop && touch.scroller.scrollTop <= 0 && point.clientY > touch.y) {
          handoff = true;
          begin(touch.y);
        } else {
          touch = null;
          return;
        }
      }
      event.preventDefault();
      move(point.clientY);
    };
    const onEnd = () => {
      if (handoff) end();
      touch = null;
      handoff = false;
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      ref={sheetRef}
      className="snap-sheet"
      aria-label={label}
      style={{ transform: `translateY(${offsetRef.current}px)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <button
        type="button"
        className="snap-sheet-grabber"
        aria-expanded={expanded}
        aria-label={grabberLabel}
        onClick={() => {
          // The click that ends a drag is not a toggle.
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          onGrabber();
        }}
      >
        <span aria-hidden="true" />
      </button>
      {children}
    </section>
  );
}
