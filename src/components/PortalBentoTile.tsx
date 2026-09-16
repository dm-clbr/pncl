/**
 * A single card in the portal bento grid.
 *
 * The tile face takes a translateZ from its grid row so rows separate under
 * camera rotation; its content node is registered with the stage, which writes
 * a counter-rotation to it every frame. That difference between face and
 * contents is what reads as parallax rather than a flat sheet tipping over.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePortalCamera } from "@/components/PortalBentoStage";

/** translateZ per grid row, so lower rows sit nearer the camera. */
const ROW_DEPTH_PX = 26 / 3;

export interface PortalBentoStat {
  label: string;
  value: ReactNode;
  accent?: boolean;
}

interface PortalBentoTileProps {
  index: number;
  title: string;
  /** Zero-based grid row, used for depth. */
  row: number;
  /** Reading-order position, used for the entry stagger. */
  order: number;
  children?: ReactNode;
  stats?: PortalBentoStat[];
  headerAside?: ReactNode;
  urgent?: boolean;
  expanded?: boolean;
  className?: string;
  /** Renders the whole tile as a router link. */
  to?: string;
  /** Renders the whole tile as a button. Ignored when `to` is set. */
  onClick?: () => void;
  ariaExpanded?: boolean;
  ariaLabel?: string;
}

function formatIndex(index: number): string {
  return String(index).padStart(2, "0");
}

export default function PortalBentoTile({
  index,
  title,
  row,
  order,
  children,
  stats,
  headerAside,
  urgent = false,
  expanded = false,
  className = "",
  to,
  onClick,
  ariaExpanded,
  ariaLabel,
}: PortalBentoTileProps) {
  const { registerContent } = usePortalCamera();
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => registerContent(contentRef.current), [registerContent]);

  const style = {
    "--tile-depth": `${row * ROW_DEPTH_PX}px`,
    "--tile-order": order,
  } as CSSProperties;

  const classes = [
    "portal-tile-card",
    urgent ? "is-urgent" : "",
    expanded ? "is-expanded" : "",
    to || onClick ? "is-actionable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <div className="portal-tile-content" ref={contentRef}>
      <div className="portal-tile-head">
        <span className="portal-tile-index" aria-hidden="true">
          {formatIndex(index)}
        </span>
        <span className="portal-tile-name">{title}</span>
        {headerAside && <span className="portal-tile-aside">{headerAside}</span>}
      </div>

      <div className="portal-tile-body">{children}</div>

      {stats && stats.length > 0 && (
        <div className="portal-tile-stats">
          {stats.map((stat) => (
            <div className="portal-tile-stat" key={stat.label}>
              <span className="portal-tile-stat-label">{stat.label}</span>
              <span
                className={`portal-tile-stat-value${stat.accent ? " is-accent" : ""}`}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className={classes} style={style} aria-label={ariaLabel}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={onClick}
        aria-expanded={ariaExpanded}
        aria-label={ariaLabel}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={classes} style={style}>
      {body}
    </div>
  );
}

/**
 * A tile whose header toggles an inline panel. The panel scrolls inside the
 * tile so expanding never reflows the grid.
 */
export function PortalBentoExpandTile({
  panel,
  onToggle,
  expanded,
  panelLabel,
  ...tile
}: PortalBentoTileProps & {
  panel: ReactNode;
  onToggle: () => void;
  expanded: boolean;
  panelLabel: string;
}) {
  const { registerContent } = usePortalCamera();
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => registerContent(contentRef.current), [registerContent]);

  const style = {
    "--tile-depth": `${tile.row * ROW_DEPTH_PX}px`,
    "--tile-order": tile.order,
  } as CSSProperties;

  const classes = [
    "portal-tile-card",
    "is-actionable",
    tile.urgent ? "is-urgent" : "",
    expanded ? "is-expanded" : "",
    tile.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={style}>
      <div className="portal-tile-content" ref={contentRef}>
        <button
          type="button"
          className="portal-tile-trigger"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="portal-tile-head">
            <span className="portal-tile-index" aria-hidden="true">
              {formatIndex(tile.index)}
            </span>
            <span className="portal-tile-name">{tile.title}</span>
            {tile.headerAside && (
              <span className="portal-tile-aside">{tile.headerAside}</span>
            )}
          </span>
        </button>

        <div className="portal-tile-body">{tile.children}</div>

        {expanded && (
          <div className="portal-tile-panel-scroll" aria-label={panelLabel}>
            {panel}
          </div>
        )}

        {tile.stats && tile.stats.length > 0 && (
          <div className="portal-tile-stats">
            {tile.stats.map((stat) => (
              <div className="portal-tile-stat" key={stat.label}>
                <span className="portal-tile-stat-label">{stat.label}</span>
                <span
                  className={`portal-tile-stat-value${stat.accent ? " is-accent" : ""}`}
                >
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
