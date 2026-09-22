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

/** The header every portal sub-page carries. Above 620px it reads as a
    breadcrumb over the title; at 620px and below it becomes a 44px sticky bar
    of back chevron plus title on the shared bar fill. Styles under
    .portal-subhead in src/styles/portal-shell.css. */
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
