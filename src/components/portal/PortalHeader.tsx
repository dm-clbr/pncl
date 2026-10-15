import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import PNCLLogo from "@/components/PNCLLogo";

type PortalHeaderProps = {
  /** Agent's display name. Shown in the profile chip above 620px. */
  name: string;
  email?: string;
  /** Avatar fallback when there is no photo. */
  initials: string;
  photoUrl?: string | null;
  /** Optional action immediately before the profile, within the existing row. */
  action?: ReactNode;
  /** Set on a page that also carries PortalSubpageHeader. That header holds the
      page's h1, so the masthead title steps down to a paragraph and the page
      keeps exactly one h1. */
  subpage?: boolean;
};

/** The portal masthead. Above 620px: logo, "Employee Portal", and the profile
    chip on the right. At 620px and below it is a 56px bar of logo left and
    avatar right, with the title kept for assistive tech. Onboarding stage
    belongs in OnboardingDock, whose header variant fits this existing row.
    Styles under .portal-header in
    src/styles/portal-shell.css. No hooks: the page owns the data.

    `subpage` steps the masthead title down to a paragraph, because a page that
    also carries PortalSubpageHeader already has its h1 there. */
export default function PortalHeader({
  name,
  email,
  initials,
  photoUrl,
  action,
  subpage = false,
}: PortalHeaderProps) {
  const Title = subpage ? "p" : "h1";
  return (
    <header className="portal-header">
      <div className="portal-header-brand">
        <Link to="/" className="portal-header-logo" aria-label="PNCL home">
          <PNCLLogo height={44} />
        </Link>
        <Title className="portal-header-title">Employee Portal</Title>
      </div>

      <div className="portal-header-actions">
        {action}
        {/* The name leads the label, so a speech user saying the visible name
            reaches the link (WCAG 2.5.3); on a phone, where only the avatar
            shows, the label still says where it goes. */}
        <Link to="/portal/profile" className="portal-header-profile" aria-label={`${name}, view profile`}>
          <span className="portal-header-identity">
            <span className="portal-header-name">{name}</span>
            {email && <span className="portal-header-mail">{email}</span>}
          </span>
          <span className="portal-header-avatar" aria-hidden="true">
            {photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials}</span>}
          </span>
        </Link>
      </div>
    </header>
  );
}
