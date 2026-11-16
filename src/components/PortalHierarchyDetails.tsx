import { TeamMetricValues } from '@/components/PortalTeamStats';
import { TEAM_PERIOD_LABELS, type PortalTeamStats, type TeamStatsPeriod } from '@/lib/portal-team-stats';
import { useRef } from "react";
import { X, ZoomIn } from "lucide-react";
import { useAdminModal } from "@/components/admin/useAdminModal";
import { AdminUserAvatar } from "@/components/admin/AdminUserAvatar";
import { AGENT_PHASE_LABELS, type AssistHierarchyNode } from "@/lib/admin-api";
import { countHierarchyPeople, type PortalHierarchyPerson } from "@/lib/portal-hierarchy";

export default function PortalHierarchyDetails({ node, people, stats, statsLoading, statsError, period, onClose, onFocus }: {
  stats: PortalTeamStats | null; statsLoading: boolean; statsError: string | null; period: TeamStatsPeriod;
  node: AssistHierarchyNode; people: PortalHierarchyPerson[]; onClose: () => void; onFocus: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useAdminModal(ref, true, onClose);
  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div ref={ref} className="admin-modal admin-hierarchy-assist-modal" role="dialog" aria-modal="true"
        aria-labelledby="portal-hierarchy-detail-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-head">
          <div><h2 id="portal-hierarchy-detail-title">{node.name}</h2><p>Team member details</p></div>
          <button type="button" className="admin-modal-close" aria-label="Close details" onClick={onClose}><X size={18} /></button>
        </div>
        {(node.members ?? [node]).map((person) => {
          const details = people.find((item) => item.id === person.id);
          const production = stats?.people.find(item => item.id === person.id);
          return (
            <section className="admin-hierarchy-assist-person" key={person.id}>
              <div className="admin-hierarchy-assist-identity">
                <AdminUserAvatar name={person.name} profilePhotoPath={details?.profilePhotoPath} profileUpdatedAt={details?.profileUpdatedAt} size="lg" />
                <h3>{person.name}</h3>
              </div>
              <dl className="admin-hierarchy-assist-details">
                <div><dt>Comp level</dt><dd>{details?.compLevel != null ? `${details.compLevel}%` : "Not set"}</dd></div>
                {details?.compLevelEffectiveAt && <div><dt>Effective date</dt><dd>{new Date(details.compLevelEffectiveAt).toLocaleDateString()}</dd></div>}
                <div><dt>Onboarding</dt><dd>{details?.phase ? AGENT_PHASE_LABELS[details.phase] : "Not available"}</dd></div>
                <div><dt>NPN</dt><dd>{person.npn ?? "Not set"}</dd></div>
                {person.referrerName && <div><dt>Upline</dt><dd>{person.referrerName}</dd></div>}
              </dl>
              <h4 className="portal-team-detail-heading">LeadSpply · {TEAM_PERIOD_LABELS[period]}</h4>
              {statsLoading ? <p>Loading stats…</p> : statsError || !production ? <p>Stats unavailable</p>
                : production.state === 'not_linked' ? <p>LeadSpply account not linked yet.</p>
                : production.state === 'account_unavailable' ? <p>LeadSpply account is unavailable.</p>
                : <dl className="admin-hierarchy-assist-details"><TeamMetricValues metrics={production.metrics} /></dl>}
            </section>
          );
        })}
        <dl className="admin-hierarchy-assist-details admin-hierarchy-assist-downline">
          <div><dt>Direct downline</dt><dd>{node.children.reduce((n, child) => n + (child.members?.length ?? 1), 0)}</dd></div>
          <div><dt>Total downline</dt><dd>{countHierarchyPeople(node.children)}</dd></div>
        </dl>
        {node.children.length > 0 && <div className="admin-modal-actions">
          <button type="button" className="admin-secondary-btn" onClick={() => onFocus(node.memberIds?.[0] ?? node.id)}><ZoomIn size={16} /> Zoom to branch</button>
        </div>}
      </div>
    </div>
  );
}
