import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, GitBranch, LayoutGrid, ListTree } from "lucide-react";
import { HierarchyAssistDetailModal } from "@/components/admin/HierarchyAssistDetailModal";
import { HierarchyCanvas } from "@/components/admin/HierarchyCanvas";
import { HierarchyEditModal } from "@/components/admin/HierarchyEditModal";
import { HierarchyPartnerEditModal } from "@/components/admin/HierarchyPartnerEditModal";
import { HierarchyTree } from "@/components/admin/HierarchyTree";
import { useAuth } from "@/contexts/AuthContext";
import {
  downloadAgentsCsv,
  getHierarchy,
  type AssistHierarchyNode,
  type HierarchyFocusOption,
  type HierarchyNode,
} from "@/lib/admin-api";
import { useAdminAgents } from "@/hooks/useAdminAgents";
import { findAssistHierarchyNode, findHierarchyNode, isPartnerGroupId } from "@/lib/hierarchy-utils";
import { isAdminAssist } from "@/lib/roles";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

type HierarchyView = "canvas" | "tree";

export default function AdminHierarchy() {
  const { user, session } = useAuth();
  const assistView = isAdminAssist(user);
  const { agents, loading: agentsLoading, reload: reloadAgents } = useAdminAgents({ enabled: !assistView });
  const [rootUserId, setRootUserId] = useState("");
  const [view, setView] = useState<HierarchyView>("canvas");
  const [fullTree, setFullTree] = useState<HierarchyNode[]>([]);
  const [assistTree, setAssistTree] = useState<AssistHierarchyNode[]>([]);
  const [focusOptions, setFocusOptions] = useState<HierarchyFocusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editAgentId, setEditAgentId] = useState<string | null>(null);
  const [editPartnerGroupId, setEditPartnerGroupId] = useState<string | null>(null);
  const [assistDetailNodeId, setAssistDetailNodeId] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  const handleExportCsv = async () => {
    const token = session?.access_token;
    if (!token) return;

    setExportingCsv(true);
    try {
      await downloadAgentsCsv(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to export agents");
    } finally {
      setExportingCsv(false);
    }
  };

  const agentOptions = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );

  const editAgent = editAgentId ? agentsById.get(editAgentId) ?? null : null;
  const editPartnerNode = editPartnerGroupId
    ? findHierarchyNode(fullTree, editPartnerGroupId)
    : null;
  const assistDetailNode = assistDetailNodeId
    ? findAssistHierarchyNode(assistTree, assistDetailNodeId)
    : null;

  const reloadHierarchy = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const data = await getHierarchy(token, rootUserId || undefined);
      if (data.readOnly) {
        setAssistTree(data.tree);
        setFocusOptions(data.focusOptions);
        setFullTree([]);
      } else {
        setFullTree(data.tree);
        setAssistTree([]);
        setFocusOptions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load hierarchy");
    } finally {
      setLoading(false);
    }
  }, [rootUserId, session?.access_token]);

  useEffect(() => {
    document.title = assistView ? "Hierarchy — PNCL Admin assist" : "Hierarchy — PNCL Admin";
    trackPageView("admin_hierarchy");
  }, [assistView]);

  useEffect(() => {
    void reloadHierarchy();
  }, [reloadHierarchy]);

  function handleSelectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    if (assistView) {
      setAssistDetailNodeId(nodeId);
      return;
    }
    if (isPartnerGroupId(nodeId)) {
      setEditPartnerGroupId(nodeId);
      setEditAgentId(null);
      return;
    }
    setEditAgentId(nodeId);
    setEditPartnerGroupId(null);
  }

  function handleFocusAgent(agentId: string) {
    setEditAgentId(null);
    setEditPartnerGroupId(null);
    setAssistDetailNodeId(null);
    setRootUserId(agentId);
  }

  async function handleSaved() {
    await Promise.all([reloadAgents(), reloadHierarchy()]);
  }

  const treeLoading = loading || (!assistView && agentsLoading);
  const hasTree = assistView ? assistTree.length > 0 : fullTree.length > 0;

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <GitBranch size={22} aria-hidden="true" />
        <div>
          <h1>Referral hierarchy</h1>
          <p>
            {assistView
              ? "Read-only view of referral connections. Partner groups appear as one combined box with shared downline."
              : "Connection lines from upline to downline. Link business partners at the same level to combine them into one box."}
          </p>
        </div>
      </div>

      <div className="admin-toolbar admin-hierarchy-toolbar">
        <label className="admin-field">
          <span>Focus on agent</span>
          <select
            value={rootUserId}
            onChange={(event) => setRootUserId(event.target.value)}
            disabled={treeLoading}
          >
            <option value="">Full organization</option>
            {assistView
              ? focusOptions.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.email}{agent.npn ? ` (${agent.npn})` : ""}
                  </option>
                ))
              : agentOptions.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.email})
                  </option>
                ))}
          </select>
        </label>

        <div className="admin-hierarchy-view-toggle" role="group" aria-label="Hierarchy view">
          <button
            type="button"
            className={`admin-hierarchy-view-btn${view === "canvas" ? " admin-hierarchy-view-btn-active" : ""}`}
            aria-pressed={view === "canvas"}
            onClick={() => setView("canvas")}
          >
            <LayoutGrid size={15} aria-hidden="true" />
            Canvas
          </button>
          <button
            type="button"
            className={`admin-hierarchy-view-btn${view === "tree" ? " admin-hierarchy-view-btn-active" : ""}`}
            aria-pressed={view === "tree"}
            onClick={() => setView("tree")}
          >
            <ListTree size={15} aria-hidden="true" />
            Tree
          </button>
        </div>

        {!assistView && (
          <button
            type="button"
            className="admin-secondary-btn"
            disabled={exportingCsv}
            onClick={() => void handleExportCsv()}
          >
            <Download size={14} aria-hidden="true" />
            {exportingCsv ? "Exporting…" : "Download CSV"}
          </button>
        )}
      </div>

      {treeLoading && (
        <div className="onboarding-spinner admin-spinner" aria-label="Loading hierarchy" />
      )}

      {!treeLoading && error && <p className="admin-error">{error}</p>}

      {!treeLoading && !error && !hasTree && (
        <p className="admin-empty">No referral connections found yet.</p>
      )}

      {!treeLoading && !error && hasTree && view === "canvas" && (
        <HierarchyCanvas
          tree={assistView ? assistTree : fullTree}
          selectedNodeId={selectedNodeId}
          assistView={assistView}
          onSelectNode={handleSelectNode}
        />
      )}

      {!treeLoading && !error && hasTree && view === "tree" && (
        <HierarchyTree
          key={rootUserId || "full"}
          tree={assistView ? assistTree : fullTree}
          selectedNodeId={selectedNodeId}
          assistView={assistView}
          onSelectNode={handleSelectNode}
        />
      )}

      {!assistView && editAgent && (
        <HierarchyEditModal
          agent={editAgent}
          agents={agents}
          agentsById={agentsById}
          tree={fullTree}
          onClose={() => setEditAgentId(null)}
          onSaved={() => void handleSaved()}
          onFocusAgent={handleFocusAgent}
        />
      )}

      {!assistView && editPartnerNode?.isPartnerGroup && (
        <HierarchyPartnerEditModal
          node={editPartnerNode}
          agents={agents}
          agentsById={agentsById}
          tree={fullTree}
          onClose={() => setEditPartnerGroupId(null)}
          onSaved={() => void handleSaved()}
          onFocusAgent={handleFocusAgent}
        />
      )}

      {assistView && assistDetailNode && (
        <HierarchyAssistDetailModal
          node={assistDetailNode}
          onClose={() => setAssistDetailNodeId(null)}
          onFocusAgent={handleFocusAgent}
        />
      )}
    </section>
  );
}
