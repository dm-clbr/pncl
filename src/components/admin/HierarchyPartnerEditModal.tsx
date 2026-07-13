import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AdminUserAvatar } from "@/components/admin/AdminUserAvatar";
import {
  linkBusinessPartners,
  unlinkBusinessPartners,
  type AgentSummary,
  type HierarchyNode,
} from "@/lib/admin-api";
import { countTotalDownline } from "@/lib/hierarchy-utils";
import { toast } from "sonner";

interface HierarchyPartnerEditModalProps {
  node: HierarchyNode;
  agents: AgentSummary[];
  agentsById: Map<string, AgentSummary>;
  tree: HierarchyNode[];
  onClose: () => void;
  onSaved: () => void;
  onFocusAgent: (agentId: string) => void;
}

export function HierarchyPartnerEditModal({
  node,
  agents,
  agentsById,
  tree,
  onClose,
  onSaved,
  onFocusAgent,
}: HierarchyPartnerEditModalProps) {
  const { session } = useAuth();
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = useMemo(
    () =>
      (node.members ?? [])
        .map((member) => agentsById.get(member.id))
        .filter((member): member is AgentSummary => Boolean(member)),
    [agentsById, node.members],
  );

  const directCount = node.children.length;
  const totalDownline = countTotalDownline(node);
  const sharedReferrer = members[0]?.referrerId ?? null;

  async function handleUnlink() {
    const token = session?.access_token;
    if (!token || members.length === 0) return;

    setUnlinking(true);
    setError(null);

    try {
      const result = await unlinkBusinessPartners(token, members[0].id);
      toast.success(result.message);
      onSaved();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to unlink partners";
      setError(message);
      toast.error(message);
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-modal admin-hierarchy-partner-modal"
        role="dialog"
        aria-labelledby="admin-hierarchy-partner-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <h2 id="admin-hierarchy-partner-title">Business partners</h2>
            <p>Shared hierarchy box with combined downline</p>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            aria-label="Close"
            disabled={unlinking}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="admin-hierarchy-partner-members">
          {members.map((member) => (
            <div key={member.id} className="admin-hierarchy-partner-member">
              <AdminUserAvatar
                name={member.name}
                email={member.email}
                profilePhotoPath={member.profilePhotoPath}
                profileUpdatedAt={member.profileUpdatedAt}
                size="lg"
              />
              <div>
                <strong>{member.name}</strong>
                <p>{member.email}</p>
                <button
                  type="button"
                  className="admin-hierarchy-edit-link"
                  onClick={() => onFocusAgent(member.id)}
                >
                  Focus on this agent
                </button>
              </div>
            </div>
          ))}
        </div>

        <dl className="admin-hierarchy-edit-stats">
          <div className="admin-hierarchy-edit-stat">
            <dt>Shared upline</dt>
            <dd>
              {sharedReferrer ? (
                <button
                  type="button"
                  className="admin-hierarchy-edit-link"
                  onClick={() => onFocusAgent(sharedReferrer)}
                >
                  {members[0]?.referrerName ?? "Unknown upline"}
                </button>
              ) : (
                "None (org root)"
              )}
            </dd>
          </div>
          <div className="admin-hierarchy-edit-stat">
            <dt>Direct reports</dt>
            <dd>{directCount}</dd>
          </div>
          <div className="admin-hierarchy-edit-stat">
            <dt>Total downline</dt>
            <dd>{totalDownline}</dd>
          </div>
        </dl>

        {error && <p className="admin-error">{error}</p>}

        <div className="admin-form-actions">
          <button
            type="button"
            className="admin-secondary-btn"
            disabled={unlinking}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="admin-danger-btn"
            disabled={unlinking}
            onClick={() => void handleUnlink()}
          >
            {unlinking ? "Unlinking…" : "Unlink partners"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface HierarchyPartnerLinkSectionProps {
  agent: AgentSummary;
  agents: AgentSummary[];
  agentsById: Map<string, AgentSummary>;
  disabled?: boolean;
  onSaved: () => void;
}

export function HierarchyPartnerLinkSection({
  agent,
  agents,
  agentsById,
  disabled = false,
  onSaved,
}: HierarchyPartnerLinkSectionProps) {
  const { session } = useAuth();
  const [partnerDraft, setPartnerDraft] = useState("");
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const partner = agent.partnerUserId ? agentsById.get(agent.partnerUserId) ?? null : null;

  const partnerOptions = useMemo(
    () =>
      [...agents]
        .filter((candidate) => {
          if (candidate.id === agent.id) return false;
          if (candidate.partnerUserId) return false;
          return (candidate.referrerId ?? null) === (agent.referrerId ?? null);
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [agent.id, agent.referrerId, agents],
  );

  async function handleLink(event: React.FormEvent) {
    event.preventDefault();
    const token = session?.access_token;
    if (!token || !partnerDraft) return;

    setLinking(true);
    setError(null);

    try {
      const result = await linkBusinessPartners(token, agent.id, partnerDraft);
      toast.success(result.message);
      setPartnerDraft("");
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to link partners";
      setError(message);
      toast.error(message);
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(event: React.FormEvent) {
    event.preventDefault();
    const token = session?.access_token;
    if (!token) return;

    setUnlinking(true);
    setError(null);

    try {
      const result = await unlinkBusinessPartners(token, agent.id);
      toast.success(result.message);
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to unlink partners";
      setError(message);
      toast.error(message);
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div className="admin-hierarchy-partner-section">
      {partner ? (
        <form
          className="admin-hierarchy-edit-field-form"
          onSubmit={(event) => void handleUnlink(event)}
        >
          <label className="admin-field admin-hierarchy-edit-field">
            <span>Business partner</span>
            <div className="admin-hierarchy-edit-field-row">
              <div className="admin-hierarchy-partner-current">
                <span>{partner.name} ({partner.email})</span>
              </div>
              <button
                type="submit"
                className="admin-danger-btn admin-hierarchy-edit-save-btn"
                disabled={unlinking || linking || disabled}
              >
                {unlinking ? "Unlinking…" : "Unlink partner"}
              </button>
            </div>
          </label>
          <p className="admin-field-hint">
            Link two agents at the same upline level to show them as one combined box with shared downline.
          </p>
          {error && <p className="admin-error">{error}</p>}
        </form>
      ) : (
        <form
          className="admin-hierarchy-edit-field-form"
          onSubmit={(event) => void handleLink(event)}
        >
          <label className="admin-field admin-hierarchy-edit-field">
            <span>Business partner</span>
            <div className="admin-hierarchy-edit-field-row">
              <select
                value={partnerDraft}
                disabled={linking || disabled || partnerOptions.length === 0}
                onChange={(event) => setPartnerDraft(event.target.value)}
              >
                <option value="">
                  {partnerOptions.length === 0
                    ? "No eligible partners at this level"
                    : "Select partner"}
                </option>
                {partnerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.email})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="admin-primary-btn admin-hierarchy-edit-save-btn"
                disabled={linking || disabled || !partnerDraft}
              >
                {linking ? "Linking…" : "Save partner"}
              </button>
            </div>
          </label>
          <p className="admin-field-hint">
            Link two agents at the same upline level to show them as one combined box with shared downline.
          </p>
          {error && <p className="admin-error">{error}</p>}
        </form>
      )}
    </div>
  );
}
