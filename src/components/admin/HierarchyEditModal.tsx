import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AdminCompLevelSelect } from "@/components/admin/AdminCompLevelSelect";
import { HierarchyPartnerLinkSection } from "@/components/admin/HierarchyPartnerEditModal";
import { updateUserCompLevel, updateUserReferrer, type AgentSummary } from "@/lib/admin-api";
import { countTotalDownline, findHierarchyNode, getDescendantAgentIds } from "@/lib/hierarchy-utils";
import type { HierarchyNode } from "@/lib/admin-api";
import { toast } from "sonner";

interface HierarchyEditModalProps {
  agent: AgentSummary;
  agents: AgentSummary[];
  agentsById: Map<string, AgentSummary>;
  tree: HierarchyNode[];
  onClose: () => void;
  onSaved: () => void;
  onFocusAgent: (agentId: string) => void;
}

export function HierarchyEditModal({
  agent,
  agents,
  agentsById,
  tree,
  onClose,
  onSaved,
  onFocusAgent,
}: HierarchyEditModalProps) {
  const { session } = useAuth();
  const [referrerDraft, setReferrerDraft] = useState(agent.referrerId ?? "");
  const [compDraft, setCompDraft] = useState<number | null>(agent.compLevel);
  const [savingUpline, setSavingUpline] = useState(false);
  const [savingComp, setSavingComp] = useState(false);
  const [uplineError, setUplineError] = useState<string | null>(null);
  const [compError, setCompError] = useState<string | null>(null);

  useEffect(() => {
    setReferrerDraft(agent.referrerId ?? "");
    setCompDraft(agent.compLevel);
    setUplineError(null);
    setCompError(null);
  }, [agent.compLevel, agent.id, agent.referrerId]);

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
  const uplineDirty = (referrerDraft || null) !== (agent.referrerId ?? null);
  const compDirty = compDraft !== agent.compLevel;
  const isBusy = savingUpline || savingComp;

  async function handleSaveUpline(event: React.FormEvent) {
    event.preventDefault();
    const token = session?.access_token;
    if (!token || !uplineDirty) return;

    setSavingUpline(true);
    setUplineError(null);

    try {
      const result = await updateUserReferrer(token, agent.id, referrerDraft || null);
      toast.success(result.message);
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update upline";
      setUplineError(message);
      toast.error(message);
    } finally {
      setSavingUpline(false);
    }
  }

  async function handleSaveComp(event: React.FormEvent) {
    event.preventDefault();
    const token = session?.access_token;
    if (!token || !compDirty) return;

    setSavingComp(true);
    setCompError(null);

    try {
      const result = await updateUserCompLevel(token, agent.id, compDraft);
      toast.success(result.message);
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update comp level";
      setCompError(message);
      toast.error(message);
    } finally {
      setSavingComp(false);
    }
  }

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-modal admin-hierarchy-edit-modal"
        role="dialog"
        aria-labelledby="admin-hierarchy-edit-title"
        onClick={(event) => event.stopPropagation()}
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
            disabled={isBusy}
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

        <form
          className="admin-hierarchy-edit-field-form"
          onSubmit={(event) => void handleSaveUpline(event)}
        >
          <label className="admin-field admin-hierarchy-edit-field">
            <span>Upline</span>
            <div className="admin-hierarchy-edit-field-row">
              <select
                value={referrerDraft}
                disabled={isBusy}
                onChange={(event) => setReferrerDraft(event.target.value)}
              >
                <option value="">None (org root)</option>
                {uplineOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.email})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="admin-primary-btn admin-hierarchy-edit-save-btn"
                disabled={isBusy || !uplineDirty}
              >
                {savingUpline ? "Saving…" : "Save upline"}
              </button>
            </div>
          </label>
          {uplineError && <p className="admin-error">{uplineError}</p>}
        </form>

        <form
          className="admin-hierarchy-edit-field-form"
          onSubmit={(event) => void handleSaveComp(event)}
        >
          <label className="admin-field admin-hierarchy-edit-field">
            <span>Comp level</span>
            <div className="admin-hierarchy-edit-field-row">
              <AdminCompLevelSelect
                agent={agent}
                agentsById={agentsById}
                draftValue={compDraft}
                disabled={isBusy}
                saving={savingComp}
                showUnavailableHint
                onChange={setCompDraft}
              />
              <button
                type="submit"
                className="admin-primary-btn admin-hierarchy-edit-save-btn"
                disabled={isBusy || !compDirty}
              >
                {savingComp ? "Saving…" : "Save comp"}
              </button>
            </div>
          </label>
          {compError && <p className="admin-error">{compError}</p>}
        </form>

        <HierarchyPartnerLinkSection
          agent={agent}
          agents={agents}
          agentsById={agentsById}
          disabled={isBusy}
          onSaved={onSaved}
        />

        <div className="admin-form-actions">
          <button
            type="button"
            className="admin-secondary-btn"
            disabled={isBusy}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
