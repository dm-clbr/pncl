import PortalDownlinePanel from "@/components/PortalDownlinePanel";
import PortalReferralPanel from "@/components/PortalReferralPanel";

export default function PortalTeamDashboard() {
  return (
    <div className="carrier-sheet-panel portal-profile-panel portal-team-dashboard">
      <div className="carrier-sheet-panel-head">
        <div>
          <h1>Team dashboard</h1>
          <p>
            Create referral links for new recruits and track their onboarding progress through the
            portal checklist.
          </p>
        </div>
      </div>

      <PortalReferralPanel embedded />
      <PortalDownlinePanel embedded />
    </div>
  );
}
