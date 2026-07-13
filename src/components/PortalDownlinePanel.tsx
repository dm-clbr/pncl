import { useMemo } from "react";
import { Users } from "lucide-react";
import { AGENT_PHASE_LABELS } from "@/lib/admin-api";
import {
  formatDownlineOnboardingStatus,
  getDownlineDisplayLabel,
  type DownlineMember,
} from "@/lib/portal-downline";
import { usePortalDownline } from "@/hooks/usePortalDownline";

function formatJoinedDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DownlineMemberRow({ member }: { member: DownlineMember }) {
  const displayLabel = getDownlineDisplayLabel(member);
  const showInviteAlias = member.inviteLabel?.trim() && member.inviteLabel.trim() !== member.name;

  return (
    <div className="portal-downline-item">
      <div className="portal-downline-item-copy">
        <strong>{displayLabel}</strong>
        {showInviteAlias && <span className="portal-downline-alias">{member.name}</span>}
        <span>
          {member.invitedCompLevel != null ? `Comp ${member.invitedCompLevel} · ` : ""}
          Joined {formatJoinedDate(member.joinedAt)}
        </span>
        {member.hasPortalAccount && member.portalPhase ? (
          <span className={`portal-phase-badge phase-${member.portalPhase}`}>
            {AGENT_PHASE_LABELS[member.portalPhase]}
          </span>
        ) : (
          <span className="portal-downline-status">
            {formatDownlineOnboardingStatus(member.onboardingStatus)}
          </span>
        )}
      </div>
    </div>
  );
}

interface PortalDownlinePanelProps {
  embedded?: boolean;
}

export default function PortalDownlinePanel({ embedded = false }: PortalDownlinePanelProps) {
  const { members, loading } = usePortalDownline();

  const activeCount = useMemo(
    () => members.filter((member) => member.hasPortalAccount && member.portalPhase !== "complete").length,
    [members],
  );

  const content = (
    <>
      <p className="portal-panel-note">
        Track onboarding progress for agents you&apos;ve referred. Phases update as recruits complete
        portal checklist steps.
      </p>

      {loading ? (
        <div className="portal-incentives-loading">
          <span className="onboarding-spinner" aria-hidden="true" />
          <span>Loading team…</span>
        </div>
      ) : members.length === 0 ? (
        <p className="portal-panel-note">
          No recruits yet. Create a referral link above to invite your first team member.
        </p>
      ) : (
        <div className="portal-downline-list">
          {members.map((member) => (
            <DownlineMemberRow key={member.onboardingId} member={member} />
          ))}
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <section className="portal-team-section">
        <div className="portal-team-section-head">
          <h2>Team progress</h2>
          {activeCount > 0 && (
            <span className="portal-team-section-count">{activeCount} in progress</span>
          )}
        </div>
        {content}
      </section>
    );
  }

  return (
    <div className="portal-tile-group portal-downline-section">
      <div className="portal-tile open" aria-expanded>
        <span className="portal-banner-icon" aria-hidden="true">
          <Users size={22} />
        </span>
        <span className="portal-tile-label">
          <span className="portal-tile-title">Team progress</span>
          {activeCount > 0 && <span className="portal-tile-count">({activeCount} in progress)</span>}
        </span>
      </div>
      <div className="portal-tile-panel portal-downline-panel">{content}</div>
    </div>
  );
}
