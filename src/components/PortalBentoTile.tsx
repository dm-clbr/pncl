/**
 * A single card in the portal bento grid.
 *
 * Interiors follow a three-tier hierarchy. Tier 1 is the glance value, Tier 2
 * the scan row, Tier 3 the reveal. Tier 3 stays in the DOM at all times and is
 * marked inert while hidden, so its links leave the tab order without the
 * content being unmounted.
 *
 * The tile face takes a translateZ from its grid row so rows separate under the
 * camera; its content node is registered with the stage, which counter-rotates
 * it each frame for parallax.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { usePortalCamera } from "@/components/PortalBentoStage";

/** translateZ per grid row, so lower rows sit nearer the camera. */
const ROW_DEPTH_PX = 12 / 3;

/** Dwell before a hover opens the reveal, so crossing the grid does not flicker. */
const HOVER_DWELL_MS = 120;

export interface PortalTileStat {
  label: string;
  value: ReactNode;
  accent?: boolean;
  success?: boolean;
}

export interface PortalTileProps {
  index: number;
  title: string;
  /** Zero-based grid row, used for depth. */
  row: number;
  /** Reading-order position, used for the entry stagger. */
  order: number;
  /** Tier 1: the single glance element. */
  tier1: ReactNode;
  /** Tier 2: the scan row, replaced by the reveal. */
  tier2?: ReactNode;
  /** Tier 3: hidden at rest. */
  reveal?: ReactNode;
  /** Sits at the tile's top right; the only non-type element allowed at rest. */
  headerAside?: ReactNode;
  /** Count shown at the far right of an index tile's header. */
  headerCount?: ReactNode;
  urgent?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Called when the tile is pinned, so the page can close any other tile. */
  onPin?: (pinned: boolean) => void;
  /** Set by the page to force this tile closed when another pins. */
  forceUnpinned?: boolean;
}

function formatIndex(index: number): string {
  return String(index).padStart(2, "0");
}

export default function PortalTile({
  index,
  title,
  row,
  order,
  tier1,
  tier2,
  reveal,
  headerAside,
  headerCount,
  urgent = false,
  className = "",
  ariaLabel,
  onPin,
  forceUnpinned = false,
}: PortalTileProps) {
  const { registerContent } = usePortalCamera();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const revealRef = useRef<HTMLDivElement | null>(null);
  const dwell = useRef<number | null>(null);

  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const revealId = useId();

  useEffect(() => registerContent(contentRef.current), [registerContent]);

  useEffect(() => {
    if (forceUnpinned && pinned) setPinned(false);
  }, [forceUnpinned, pinned]);

  const open = Boolean(reveal) && (pinned || hovered);

  // inert is not a React 18 prop, so it is set on the node directly. Keeping
  // Tier 3 mounted preserves its state; inert removes it from the tab order.
  useEffect(() => {
    const node = revealRef.current;
    if (!node) return;
    if (pinned) node.removeAttribute("inert");
    else node.setAttribute("inert", "");
  }, [pinned]);

  const clearDwell = useCallback(() => {
    if (dwell.current !== null) {
      window.clearTimeout(dwell.current);
      dwell.current = null;
    }
  }, []);

  useEffect(() => clearDwell, [clearDwell]);

  const handleEnter = useCallback(() => {
    if (!reveal) return;
    clearDwell();
    dwell.current = window.setTimeout(() => setHovered(true), HOVER_DWELL_MS);
  }, [reveal, clearDwell]);

  const handleLeave = useCallback(() => {
    clearDwell();
    setHovered(false);
  }, [clearDwell]);

  const togglePin = useCallback(() => {
    setPinned((was) => {
      const next = !was;
      onPin?.(next);
      return next;
    });
  }, [onPin]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && pinned) {
        event.stopPropagation();
        setPinned(false);
        onPin?.(false);
        return;
      }
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        togglePin();
      }
    },
    [pinned, onPin, togglePin],
  );

  const style = {
    "--tile-depth": `${row * ROW_DEPTH_PX}px`,
    "--tile-order": order,
  } as CSSProperties;

  const classes = [
    "ptile",
    urgent ? "is-urgent" : "",
    open ? "is-open" : "",
    pinned ? "is-pinned" : "",
    reveal ? "is-actionable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={style}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onClick={reveal ? togglePin : undefined}
      onKeyDown={handleKeyDown}
      tabIndex={reveal ? 0 : -1}
      role={reveal ? "button" : undefined}
      aria-expanded={reveal ? pinned : undefined}
      aria-controls={reveal ? revealId : undefined}
      aria-label={ariaLabel}
    >
      <div className="ptile-inner" ref={contentRef}>
        <div className="ptile-head">
          <span className="ptile-index" aria-hidden="true">
            {formatIndex(index)}
          </span>
          <span className="ptile-title">{title}</span>
          {headerCount !== undefined && (
            <span className="ptile-head-count">{headerCount}</span>
          )}
          {headerAside && <span className="ptile-head-aside">{headerAside}</span>}
        </div>

        <div className="ptile-tier1">{tier1}</div>

        <div className="ptile-foot">
          {tier2 && (
            <div className="ptile-tier2" aria-hidden={open ? "true" : undefined}>
              {tier2}
            </div>
          )}
          {reveal && (
            <div className="ptile-tier3" id={revealId} ref={revealRef}>
              {reveal}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tier 2 footer stats, laid out on the tile's four-column internal grid. */
export function PortalTileStats({ stats }: { stats: PortalTileStat[] }) {
  return (
    <div className="ptile-stats">
      {stats.map((stat) => (
        <div className="ptile-stat" key={stat.label}>
          <span className="ptile-stat-label">{stat.label}</span>
          <span
            className={`ptile-stat-value${stat.accent ? " is-accent" : ""}${
              stat.success ? " is-success" : ""
            }`}
          >
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Tier 1 for a metric tile: one value, one label naming it. */
export function PortalTileMetric({
  value,
  label,
  suffix,
  accent = false,
  success = false,
}: {
  value: ReactNode;
  label: string;
  suffix?: string;
  accent?: boolean;
  success?: boolean;
}) {
  return (
    <>
      <span
        className={`ptile-display${accent ? " is-accent" : ""}${
          success ? " is-success" : ""
        }`}
      >
        {value}
        {suffix && <span className="ptile-display-suffix">{suffix}</span>}
      </span>
      <span
        className={`ptile-display-label${accent ? " is-accent" : ""}${
          success ? " is-success" : ""
        }`}
      >
        {label}
      </span>
    </>
  );
}

/** Tier 1 for an index tile: a flush-left list of item titles, nothing else. */
export function PortalTileList({ items }: { items: string[] }) {
  return (
    <ul className="ptile-list">
      {items.map((item) => (
        <li className="ptile-list-item" key={item}>
          {item}
        </li>
      ))}
    </ul>
  );
}
