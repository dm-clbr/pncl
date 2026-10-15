import { useMemo } from "react";
import { Users } from "lucide-react";
import Chip, { type ChipVariant } from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import Skeleton from "@/components/portal/Skeleton";
import {
  getDownlineDisplayLabel,
  getDownlineProgress,
  type DownlineMember,
} from "@/lib/portal-downline";
import { usePortalDownline } from "@/hooks/usePortalDownline";

function formatJoinedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invite created";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DownlineMemberRow({ member }: { member: DownlineMember }) {
  const displayLabel = getDownlineDisplayLabel(member);
  const showInviteAlias = member.inviteLabel?.trim() && member.inviteLabel.trim() !== member.name;
  const progress = getDownlineProgress(member);
  const currentSegment = progress.segments.find((segment) => segment.state === "current");

  const progressCountLabel = currentSegment?.id === "activation"
    ? currentSegment.detail
    : progress.completedCount != null && progress.totalCount != null && progress.totalCount > 0
      ? `${progress.completedCount} of ${progress.totalCount} checklist steps complete`
      : currentSegment?.detail ?? null;

  // ponytail: the stage chip reads the segments already computed for the row.
  // No current segment means every segment is either done (complete, 100) or
  // upcoming (expired, 0), which is the only pair that share that shape.
  const stage: ChipVariant = currentSegment
    ? currentSegment.id === "activation" ? "pending" : "active"
    : progress.percent === 0 ? "inactive" : "active";

  const secondary = [
    showInviteAlias ? member.name : null,
    `Joined ${formatJoinedDate(member.joinedAt)}`,
    progressCountLabel,
  ].filter(Boolean).join(" \u00b7 ");

  return (
    <li>
      <ListRow
        label={displayLabel}
        secondary={secondary}
        trailing={<Chip variant={stage}>{progress.currentLabel}</Chip>}
      />
    </li>
  );
}

interface PortalDownlinePanelProps {
  embedded?: boolean;
}

export default function PortalDownlinePanel({ embedded = false }: PortalDownlinePanelProps) {
  const { members, loading, error, reload } = usePortalDownline();

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
      <p className="portal-profile-lede">
        Track onboarding progress for agents you&apos;ve referred, from portal activation through
        each checklist stage.
      </p>

      {loading ? (
        <div className="portal-profile-rows" aria-busy="true">
          <span className="portal-sr">Loading team...</span>
          <Skeleton variant="row" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      ) : error ? (
        <div className="portal-profile-error" role="alert">
          <p>We couldn&apos;t load team progress right now.</p>
          <button type="button" className="portal-profile-btn" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={<Users size={22} aria-hidden="true" />}
          title="No recruits yet"
          body="Create a referral link above to invite your first team member."
        />
      ) : (
        <ul className="portal-profile-rows">
          {members.map((member, index) => (
            <DownlineMemberRow key={`${member.name}-${member.inviteLabel ?? ""}-${index}`} member={member} />
          ))}
        </ul>
      )}
    </>
  );

  if (embedded) {
    return (
      <Pane
        title="Team progress"
        aside={activeCount > 0 ? <Chip variant="active">{activeCount} in progress</Chip> : undefined}
      >
        {content}
      </Pane>
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
