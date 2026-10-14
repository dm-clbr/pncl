import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

type PortalSubpageHeaderProps = {
  title: string;
  /** Where the back link goes. */
  backTo?: string;
  /** Back link text. Visible above 620px, read-only below it. */
  backLabel?: string;
  /** Right side of the title row: a count, a Chip, one action. */
  aside?: ReactNode;
};

/** Shared transparent title/back-link chrome with a bottom divider. Above
    620px the breadcrumb sits over the title in a 115px header; phones use a
    53px inline row that fits 52px controls and the divider.
    Stays in page flow so content never scrolls beneath transparent text.
    Styles under .portal-subhead in src/styles/portal-shell.css. */
export default function PortalSubpageHeader({
  title,
  backTo = "/portal",
  backLabel = "Back to portal",
  aside,
}: PortalSubpageHeaderProps) {
  return (
    <header className="portal-subhead">
      <Link to={backTo} className="portal-subhead-back">
        <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        <span className="portal-subhead-back-label">{backLabel}</span>
      </Link>
      <h1 className="portal-subhead-title">{title}</h1>
      {aside && <div className="portal-subhead-aside">{aside}</div>}
    </header>
  );
}
