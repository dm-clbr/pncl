import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { isOutbound } from "@/components/portal-tile-helpers";

type ListRowProps = {
  label: ReactNode;
  /** Optional second line under the label, one rung quieter. */
  secondary?: ReactNode;
  /** Leading slot, rendered at 18px. */
  icon?: ReactNode;
  /** Route, offsite URL or file URL. With `download` the row is a download. */
  href?: string;
  /** Turns the row into a button. Ignored when `href` is set. */
  onClick?: () => void;
  /** Suggested filename; makes the row a same-tab download rather than a link. */
  download?: string;
  /** Defaults to a chevron (internal) or an outbound glyph (external).
      Pass null for no trailing element, or a node to replace it. */
  trailing?: ReactNode;
  /** Marks the row the rest of the view is showing: the selected state on the
      map, the open record in a list. Sets aria-current so it is announced. */
  current?: boolean;
};

const GLYPH = { size: 14, strokeWidth: 1.75 } as const;

/** One 44px row: leading icon, label plus optional secondary line, trailing
    glyph. Styles under .portal-row in src/styles/portal-primitives.css; the
    44px height is what keeps 8px between adjacent targets. Renders a router
    Link for an internal href, a new-tab anchor for an offsite one, a button
    for onClick, and a plain div otherwise. */
export default function ListRow({
  label,
  secondary,
  icon,
  href,
  onClick,
  download,
  trailing,
  current,
}: ListRowProps) {
  const external = href !== undefined && download === undefined && isOutbound(href);
  const fallback = href === undefined || download !== undefined ? null : external ? (
    <ArrowUpRight {...GLYPH} aria-hidden="true" />
  ) : (
    <ChevronRight {...GLYPH} aria-hidden="true" />
  );
  // undefined means "use the default"; null means "no trailing element".
  const trail = trailing === undefined ? fallback : trailing;
  const attrs = { className: "portal-row", ...(current && { "aria-current": true as const }) };

  const inner = (
    <>
      {icon && (
        <span className="portal-row-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="portal-row-copy">
        <span className="portal-row-label">{label}</span>
        {secondary && <span className="portal-row-secondary">{secondary}</span>}
      </span>
      {trail && <span className="portal-row-trail">{trail}</span>}
      {external && <span className="portal-sr">opens in a new tab</span>}
    </>
  );

  // ponytail: a download is neither internal navigation nor a new tab, so it
  // keeps the plain anchor the browser needs for the download attribute.
  if (href !== undefined && download !== undefined) {
    return (
      <a {...attrs} href={href} download={download}>
        {inner}
      </a>
    );
  }
  if (href !== undefined && external) {
    return (
      <a {...attrs} href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }
  if (href !== undefined) {
    return (
      <Link {...attrs} to={href}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" {...attrs} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div {...attrs}>{inner}</div>;
}
