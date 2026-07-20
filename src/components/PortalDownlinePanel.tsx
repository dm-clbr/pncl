import { useMemo } from "react";
import { Users } from "lucide-react";
import {
  getDownlineDisplayLabel,
  getDownlineProgress,
  type DownlineMember,
  type DownlineProgressSegment,
} from "@/lib/portal-downline";
import { usePortalDownline } from "@/hooks/usePortalDownline";

function formatJoinedDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DownlineSegmentedBar({
  segments,
  overallPercent,
  currentLabel,
}: {
  segments: DownlineProgressSegment[];
  overallPercent: number;
  currentLabel: string;
}) {
  return (
    <div
      className="portal-downline-segmented-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={overallPercent}
      aria-label={`${currentLabel} progress`}
    >
      {segments.map((segment) => (
        <div
          key={segment.id}
          className={`portal-downline-segment${segment.state ? ` ${segment.state}` : ""}${segment.id !== "activation" ? ` phase-${segment.id}` : ""}`}
          title={segment.detail ? `${segment.label}: ${segment.detail}` : segment.label}
        >
          <div className="portal-downline-segment-track">
            <span
              className="portal-downline-segment-fill"
              style={{ width: `${segment.fillPercent}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DownlineMemberRow({ member }: { member: DownlineMember }) {
  const displayLabel = getDownlineDisplayLabel(member);
  const showInviteAlias = member.inviteLabel?.trim() && member.inviteLabel.trim() !== member.name;
  const progress = getDownlineProgress(member);
  const currentSegment = progress.segments.find((segment) => segment.state === "current");
  const showPhaseBadge = currentSegment && currentSegment.id !== "activation";

  const progressCountLabel = currentSegment?.id === "activation"
    ? currentSegment.detail
    : progress.completedCount != null && progress.totalCount != null && progress.totalCount > 0
      ? `${progress.completedCount} of ${progress.totalCount} checklist steps complete`
      : currentSegment?.detail ?? null;

  return (
    <div className="portal-downline-item">
      <div className="portal-downline-item-copy">
        <strong>{displayLabel}</strong>
        {showInviteAlias && <span className="portal-downline-alias">{member.name}</span>}
        <span>
          {member.invitedCompLevel != null ? `Comp ${member.invitedCompLevel} · ` : ""}
          Joined {formatJoinedDate(member.joinedAt)}
        </span>
      </div>

      <div className="portal-downline-progress" aria-label={`${displayLabel} onboarding progress`}>
        <div className="portal-downline-progress-head">
          {showPhaseBadge ? (
            <span className={`portal-phase-badge phase-${currentSegment.id}`}>
              {progress.currentLabel}
            </span>
          ) : (
            <span className="portal-downline-status">{progress.currentLabel}</span>
          )}
          {progressCountLabel && (
            <span className="portal-downline-progress-count">{progressCountLabel}</span>
          )}
        </div>

        <DownlineSegmentedBar
          segments={progress.segments}
          overallPercent={progress.percent}
          currentLabel={progress.currentLabel}
        />

        <div className="portal-downline-segment-labels" aria-hidden="true">
          {progress.segments.map((segment) => (
            <span
              key={segment.id}
              className={`portal-downline-segment-label ${segment.state}${segment.id !== "activation" ? ` phase-${segment.id}` : ""}`}
            >
              <span className="portal-downline-segment-label-text">{segment.label}</span>
              {segment.detail && segment.state !== "upcoming" && (
                <span className="portal-downline-segment-label-detail">{segment.detail}</span>
              )}
            </span>
          ))}
        </div>
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
    () =>
      members.filter((member) => {
        if (member.onboardingStatus === "expired") return false;
        if (member.portalPhase === "complete") return false;
        if (member.todoProgress) {
          return member.todoProgress.completedCount < member.todoProgress.totalCount
            || !member.hasPortalAccount;
        }
        return true;
      }).length,
    [members],
  );

  const content = (
    <>
      <p className="portal-panel-note">
        Track onboarding progress for agents you&apos;ve referred — from portal activation through
        each checklist stage.
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
