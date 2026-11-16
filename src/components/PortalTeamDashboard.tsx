import PortalDownlinePanel from "@/components/PortalDownlinePanel";
import PortalReferralPanel from "@/components/PortalReferralPanel";
import { Link } from "react-router-dom";

export default function PortalTeamDashboard() {
  return (
    <div className="portal-profile-team">
      <p className="portal-profile-lede">
        View your team hierarchy, invite new recruits, and track their onboarding progress.
      </p>

      <Link className="portal-profile-btn" to="/portal/team">View my team hierarchy</Link>
      <PortalReferralPanel embedded />
      <PortalDownlinePanel embedded />
    </div>
  );
}
