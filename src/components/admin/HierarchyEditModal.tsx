import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { updateUserReferrer, type AgentSummary } from "@/lib/admin-api";
import { countTotalDownline, findHierarchyNode, getDescendantAgentIds } from "@/lib/hierarchy-utils";
import type { HierarchyNode } from "@/lib/admin-api";

interface HierarchyEditModalProps {
  agent: AgentSummary;
  agents: AgentSummary[];
  tree: HierarchyNode[];
  onClose: () => void;
  onSaved: () => void;
  onFocusAgent: (agentId: string) => void;
}

export function HierarchyEditModal({
  agent,
  agents,
  tree,
  onClose,
  onSaved,
  onFocusAgent,
}: HierarchyEditModalProps) {
  const { session } = useAuth();
  const [referrerDraft, setReferrerDraft] = useState(agent.referrerId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descendants = useMemo(() => getDescendantAgentIds(agents, agent.id), [agents, agent.id]);

  const uplineOptions = useMemo(
    () =>
      [...agents]
        .filter((candidate) => candidate.id !== agent.id && !descendants.has(candidate.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [agents, agent.id, descendants],
  );

  const treeNode = useMemo(() => findHierarchyNode(tree, agent.id), [tree, agent.id]);
  const directCount = treeNode?.children.length ?? 0;
  const totalDownline = treeNode ? countTotalDownline(treeNode) : 0;

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const token = session?.access_token;
    if (!token) return;

    setSaving(true);
    setError(null);

    try {
      await updateUserReferrer(token, agent.id, referrerDraft || null);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update upline");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <form
        className="admin-modal admin-hierarchy-edit-modal"
        role="dialog"
        aria-labelledby="admin-hierarchy-edit-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSave(event)}
      >
        <div className="admin-modal-head">
          <div>
            <h2 id="admin-hierarchy-edit-title">{agent.name}</h2>
            <p>{agent.email}</p>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <dl className="admin-hierarchy-edit-stats">
          <div className="admin-hierarchy-edit-stat">
            <dt>Current upline</dt>
            <dd>
              {agent.referrerId ? (
                <button
                  type="button"
                  className="admin-hierarchy-edit-link"
                  onClick={() => onFocusAgent(agent.referrerId!)}
                >
                  {agent.referrerName ?? "Unknown upline"}
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

        <label className="admin-field">
          <span>Upline</span>
          <select
            value={referrerDraft}
            disabled={saving}
            onChange={(event) => setReferrerDraft(event.target.value)}
          >
            <option value="">None (org root)</option>
            {uplineOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} ({option.email})
              </option>
            ))}
          </select>
        </label>

        {error && <p className="admin-error">{error}</p>}

        <div className="admin-form-actions">
          <button
            type="button"
            className="admin-secondary-btn"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="admin-primary-btn" disabled={saving}>
            {saving ? "Saving…" : "Save upline"}
          </button>
        </div>
      </form>
    </div>
  );
}
