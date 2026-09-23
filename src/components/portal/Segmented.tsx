import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

export type SegmentedItem = {
  value: string;
  label: ReactNode;
  /** Tab mode: the id of the panel this tab controls. */
  controls?: string;
  /** Tab mode: the tab's own id, for the panel's aria-labelledby. */
  id?: string;
};

type SegmentedProps = {
  items: readonly SegmentedItem[];
  value: string;
  /** Tab mode only; in link mode the route carries the change. */
  onChange?: (value: string) => void;
  /** Names the tablist or, in link mode, the navigation. */
  label: string;
  /** Id of a visible label to name the group with instead of `label`. */
  labelledBy?: string;
  /** "radiogroup" for a form choice that controls no panel. Default "tab". */
  mode?: "tab" | "radiogroup";
  /** Link mode: the href for an item. Drops the tab roles for aria-current. */
  linkTo?: (value: string) => string;
};

/** Next index for the roving tablist: Left and Right wrap, Home and End jump,
    anything else is not ours. Exported for its unit test. */
export function nextIndex(key: string, index: number, count: number): number | null {
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Horizontal tabs. Styles under .portal-segmented in
    src/styles/portal-primitives.css: 44px items, 8px apart, on a recessed
    track that scrolls sideways on a phone with a fade on whichever edge has
    something behind it. Tab mode is a roving tablist (Left, Right, Home, End);
    `linkTo` turns the items into router links that keep ?tab= in the URL.
    `mode="radiogroup"` swaps the tab roles for radio ones when the control is a
    form choice with no panel behind it; the roving keys are unchanged. */
export default function Segmented({
  items,
  value,
  onChange,
  label,
  labelledBy,
  mode = "tab",
  linkTo,
}: SegmentedProps) {
  const radio = !linkTo && mode === "radiogroup";
  const trackRef = useRef<HTMLDivElement>(null);
  // Roving tabindex needs one tab in the tab order at all times. A stale ?tab=
  // in a bookmarked URL matches nothing, and -1 on every tab would drop the
  // whole group out of the tab order with no keyboard way back in, so index 0
  // holds it.
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );

  // 0px of fade means no fade, so each edge only softens once it has content
  // behind it. Written straight to the DOM: scrolling must not re-render.
  const syncEdges = () => {
    const track = trackRef.current;
    if (!track) return;
    track.dataset.fadeStart = String(track.scrollLeft > 1);
    track.dataset.fadeEnd = String(track.scrollLeft < track.scrollWidth - track.clientWidth - 1);
  };

  useEffect(() => {
    // Keep the active item in view; nearest so neither axis jumps further than
    // it must. scrollIntoView is optional: jsdom does not implement it.
    const active = trackRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    syncEdges();
    window.addEventListener("resize", syncEdges);
    return () => window.removeEventListener("resize", syncEdges);
  }, [value, items.length]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextIndex(event.key, index, items.length);
    if (next === null) return;
    event.preventDefault();
    onChange?.(items[next].value);
    trackRef.current?.querySelectorAll<HTMLButtonElement>(".portal-segment")[next]?.focus();
  };

  return (
    <div
      ref={trackRef}
      className="portal-segmented"
      role={linkTo ? "navigation" : radio ? "radiogroup" : "tablist"}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      onScroll={syncEdges}
    >
      {items.map((item, index) => {
        const active = item.value === value;
        return linkTo ? (
          <Link
            key={item.value}
            id={item.id}
            className="portal-segment"
            to={linkTo(item.value)}
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ) : (
          <button
            key={item.value}
            id={item.id}
            type="button"
            className="portal-segment"
            role={radio ? "radio" : "tab"}
            aria-selected={radio ? undefined : active}
            aria-checked={radio ? active : undefined}
            aria-controls={radio ? undefined : item.controls}
            tabIndex={index === activeIndex ? 0 : -1}
            data-active={active}
            onClick={() => onChange?.(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
