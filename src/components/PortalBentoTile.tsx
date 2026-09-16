/**
 * A card in the portal bento grid, and the menu it opens.
 *
 * Interaction contract: click, tap, Enter or Space opens the menu and it stays
 * open. Escape, a click outside, or opening another card closes it. Hover does
 * nothing but light the card, so the dashboard behaves the same on a phone as
 * on a desktop and nothing opens or closes by accident.
 *
 * The menu renders into a flat overlay outside the 3D stage rather than inside
 * the card. A panel positioned inside a rotated preserve-3d scene is just
 * another plane, and neighbouring card planes slice through it whatever its
 * z-index or depth. Out here it stacks normally and can size itself to its
 * content. It follows its card every frame so the camera can keep drifting
 * underneath without the menu coming adrift.
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
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { usePortalCamera } from "@/components/PortalBentoStage";

/** translateZ per grid row, so lower rows sit nearer the camera. */
const ROW_DEPTH_PX = 12 / 3;

/** Flush: the menu is meant to read as the card continuing, not as a popover. */
const MENU_GAP = 0;
const MENU_MIN_WIDTH = 236;
const MENU_EDGE_PAD = 12;

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
  /** One short supporting line under the name. */
  meta?: ReactNode;
  /** Marks the meta line as needing action. */
  accent?: boolean;
  /** Menu contents. A card with none is a plain card, not a disclosure. */
  reveal?: ReactNode;
  /** A small outline mark heading the name. */
  icon?: ReactNode;
  /** Sits at the card's top right. */
  headerAside?: ReactNode;
  headerCount?: ReactNode;
  urgent?: boolean;
  className?: string;
  ariaLabel?: string;
  /** True while this card owns the open menu. */
  open?: boolean;
  /** Asks the page to open this card's menu, or close whichever is open. */
  onOpenChange?: (open: boolean) => void;
}

function formatIndex(index: number): string {
  return String(index).padStart(2, "0");
}

interface MenuBox {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: "below" | "above";
}

/** Places the menu against its card, flipping and clamping to stay on screen. */
function measure(card: HTMLElement, menuHeight: number): MenuBox {
  const r = card.getBoundingClientRect();
  const width = Math.max(r.width, MENU_MIN_WIDTH);
  const roomBelow = window.innerHeight - r.bottom - MENU_GAP - MENU_EDGE_PAD;
  const roomAbove = r.top - MENU_GAP - MENU_EDGE_PAD;

  const below = menuHeight <= roomBelow || roomBelow >= roomAbove;
  const maxHeight = Math.max(140, below ? roomBelow : roomAbove);

  let left = r.left;
  if (left + width > window.innerWidth - MENU_EDGE_PAD) {
    left = window.innerWidth - MENU_EDGE_PAD - width;
  }
  left = Math.max(MENU_EDGE_PAD, left);

  const top = below
    ? r.bottom + MENU_GAP
    : Math.max(MENU_EDGE_PAD, r.top - MENU_GAP - Math.min(menuHeight, maxHeight));

  return { left, top, width, maxHeight, placement: below ? "below" : "above" };
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
  open = false,
  onOpenChange,
}: PortalTileProps) {
  const { registerContent } = usePortalCamera();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [box, setBox] = useState<MenuBox | null>(null);
  const menuId = useId();
  const hasMenu = Boolean(reveal);

  useEffect(() => registerContent(contentRef.current), [registerContent]);

  // The menu lives outside the stage, so it has to follow its card while the
  // camera drifts. One rAF loop, only while this card's menu is open.
  useEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    let frame = 0;
    const sync = () => {
      const card = cardRef.current;
      if (card) {
        const height = menuRef.current?.scrollHeight ?? 0;
        const next = measure(card, height);
        setBox((prev) =>
          prev &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.top - next.top) < 0.5 &&
          prev.width === next.width &&
          prev.placement === next.placement
            ? prev
            : next,
        );
      }
      frame = requestAnimationFrame(sync);
    };
    frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Escape closes and hands focus back; a pointer press outside closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onOpenChange?.(false);
      cardRef.current?.focus();
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (cardRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChange?.(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, onOpenChange]);

  const toggle = useCallback(() => {
    if (!hasMenu) return;
    onOpenChange?.(!open);
  }, [hasMenu, open, onOpenChange]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  const style = {
    "--tile-depth": `${row * ROW_DEPTH_PX}px`,
    "--tile-order": order,
  } as CSSProperties;

  const classes = [
    "ptile",
    urgent ? "is-urgent" : "",
    open ? "is-open" : "",
    open ? `is-open-${box?.placement ?? "below"}` : "",
    hasMenu ? "is-actionable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        ref={cardRef}
        className={classes}
        style={style}
        onClick={toggle}
        onKeyDown={onKeyDown}
        tabIndex={hasMenu ? 0 : -1}
        role={hasMenu ? "button" : undefined}
        aria-expanded={hasMenu ? open : undefined}
        aria-controls={hasMenu ? menuId : undefined}
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
              <span className={`ptile-meta${accent ? " is-accent" : ""}`}>{meta}</span>
            )}
            {hasMenu && (
              <span className="ptile-caret" aria-hidden="true">
                <ChevronDown size={14} strokeWidth={2} />
              </span>
            )}
          </div>
        </div>
      </div>

      {hasMenu &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className={`ptile-menu is-${box?.placement ?? "below"}`}
            role="group"
            aria-label={title}
            style={{
              left: box?.left ?? -9999,
              top: box?.top ?? -9999,
              width: box?.width,
              maxHeight: box?.maxHeight,
              visibility: box ? "visible" : "hidden",
            }}
          >
            <div className="ptile-menu-head">
              <span className="ptile-menu-title">{title}</span>
              {headerCount !== undefined && (
                <span className="ptile-menu-count">{headerCount}</span>
              )}
            </div>
            <div className="ptile-menu-body">{reveal}</div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Footer stats, laid out on the card's four-column internal grid. */
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
