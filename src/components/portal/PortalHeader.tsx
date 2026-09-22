import { Link } from "react-router-dom";
import PNCLLogo from "@/components/PNCLLogo";

type PortalHeaderProps = {
  /** Agent's display name. Shown in the profile chip above 620px. */
  name: string;
  email?: string;
  /** Avatar fallback when there is no photo. */
  initials: string;
  photoUrl?: string | null;
  /** Onboarding phase. Shown as the stage badge above 620px. */
  stage?: string;
};

/** The portal masthead. Above 620px: logo, "Employee Portal", stage badge, and
    the profile chip on the right. At 620px and below it is a 56px bar of logo
    left and avatar right, with the title kept for assistive tech and the stage
    carried by the progress strip underneath. Styles under .portal-header in
    src/styles/portal-shell.css. No hooks: the page owns the data. */
export default function PortalHeader({
  name,
  email,
  initials,
  photoUrl,
  stage,
}: PortalHeaderProps) {
  return (
    <header className="portal-header">
      <div className="portal-header-brand">
        <Link to="/" className="portal-header-logo" aria-label="PNCL home">
          <PNCLLogo height={44} />
        </Link>
        <h1 className="portal-header-title">Employee Portal</h1>
        {stage && <span className="portal-header-stage">{stage}</span>}
      </div>

      <Link to="/portal/profile" className="portal-header-profile" aria-label="View profile">
        <span className="portal-header-identity">
          <span className="portal-header-name">{name}</span>
          {email && <span className="portal-header-mail">{email}</span>}
        </span>
        <span className="portal-header-avatar" aria-hidden="true">
          {photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials}</span>}
        </span>
      </Link>
    </header>
  );
}
