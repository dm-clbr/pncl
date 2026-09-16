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
  /** One short supporting line under the name. Everything else is a reveal. */
  meta?: ReactNode;
  /** Marks the meta line as needing action. */
  accent?: boolean;
  /** Tier 3: hidden at rest. */
  reveal?: ReactNode;
  /** A small outline mark left of the title, so tiles are tellable apart. */
  icon?: ReactNode;
  /** Sits at the tile's top right. */
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
  meta,
  accent = false,
  reveal,
  icon,
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
          {headerCount !== undefined && (
            <span className="ptile-head-count">{headerCount}</span>
          )}
          {headerAside && <span className="ptile-head-aside">{headerAside}</span>}
        </div>

        {/* The name is the anchor and stays put; only the line under it swaps. */}
        <div className="ptile-rest">
          {icon && (
            <span className="ptile-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="ptile-name">{title}</span>
        </div>

        <div className="ptile-swap">
          {meta && (
            <span
              className={`ptile-meta${accent ? " is-accent" : ""}`}
              aria-hidden={open ? "true" : undefined}
            >
              {meta}
            </span>
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


