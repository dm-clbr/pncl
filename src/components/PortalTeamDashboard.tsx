import PortalDownlinePanel from "@/components/PortalDownlinePanel";
import PortalReferralPanel from "@/components/PortalReferralPanel";

export default function PortalTeamDashboard() {
  return (
    <div className="portal-profile-team">
      <p className="portal-profile-lede">
        Create referral links for new recruits and track their onboarding progress through the
        portal checklist.
      </p>

      <PortalReferralPanel embedded />
      <PortalDownlinePanel embedded />
    </div>
  );
}
