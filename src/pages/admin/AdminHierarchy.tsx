import { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, LayoutGrid, ListTree } from "lucide-react";
import { HierarchyCanvas } from "@/components/admin/HierarchyCanvas";
import { HierarchyEditModal } from "@/components/admin/HierarchyEditModal";
import { HierarchyTree } from "@/components/admin/HierarchyTree";
import { useAuth } from "@/contexts/AuthContext";
import { getHierarchy } from "@/lib/admin-api";
import { useAdminAgents } from "@/hooks/useAdminAgents";
import { trackPageView } from "@/lib/analytics";

type HierarchyView = "canvas" | "tree";

export default function AdminHierarchy() {
  const { session } = useAuth();
  const { agents, loading: agentsLoading, reload: reloadAgents } = useAdminAgents();
  const [rootUserId, setRootUserId] = useState("");
  const [view, setView] = useState<HierarchyView>("canvas");
  const [tree, setTree] = useState<Awaited<ReturnType<typeof getHierarchy>>["tree"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editAgentId, setEditAgentId] = useState<string | null>(null);

  const agentOptions = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );

  const editAgent = editAgentId ? agentsById.get(editAgentId) ?? null : null;

  const reloadHierarchy = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const data = await getHierarchy(token, rootUserId || undefined);
      setTree(data.tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load hierarchy");
    } finally {
      setLoading(false);
    }
  }, [rootUserId, session?.access_token]);

  useEffect(() => {
    document.title = "Hierarchy — PNCL Admin";
    trackPageView("admin_hierarchy");
  }, []);

  useEffect(() => {
    void reloadHierarchy();
  }, [reloadHierarchy]);

  function handleSelectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setEditAgentId(nodeId);
  }

  function handleFocusAgent(agentId: string) {
    setEditAgentId(null);
    setRootUserId(agentId);
  }

  async function handleSaved() {
    await Promise.all([reloadAgents(), reloadHierarchy()]);
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <GitBranch size={22} aria-hidden="true" />
        <div>
          <h1>Referral hierarchy</h1>
          <p>Connection lines from upline to downline, based on referral links at onboarding.</p>
        </div>
      </div>

      <div className="admin-toolbar admin-hierarchy-toolbar">
        <label className="admin-field">
          <span>Focus on agent</span>
          <select
            value={rootUserId}
            onChange={(event) => setRootUserId(event.target.value)}
            disabled={agentsLoading}
          >
            <option value="">Full organization</option>
            {agentOptions.map((agent) => (
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
      </div>

      {(loading || agentsLoading) && (
        <div className="onboarding-spinner admin-spinner" aria-label="Loading hierarchy" />
      )}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && tree.length === 0 && (
        <p className="admin-empty">No referral connections found yet.</p>
      )}

      {!loading && !error && tree.length > 0 && view === "canvas" && (
        <HierarchyCanvas
          tree={tree}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />
      )}

      {!loading && !error && tree.length > 0 && view === "tree" && (
        <HierarchyTree
          key={rootUserId || "full"}
          tree={tree}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />
      )}

      {editAgent && (
        <HierarchyEditModal
          agent={editAgent}
          agents={agents}
          agentsById={agentsById}
          tree={tree}
          onClose={() => setEditAgentId(null)}
          onSaved={() => void handleSaved()}
          onFocusAgent={handleFocusAgent}
        />
      )}
    </section>
  );
}
