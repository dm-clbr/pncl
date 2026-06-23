import { useEffect, useMemo, useState } from "react";
import { GitBranch } from "lucide-react";
import { HierarchyCanvas } from "@/components/admin/HierarchyCanvas";
import { useAuth } from "@/contexts/AuthContext";
import { getHierarchy } from "@/lib/admin-api";
import { useAdminAgents } from "@/hooks/useAdminAgents";
import { trackPageView } from "@/lib/analytics";

export default function AdminHierarchy() {
  const { session } = useAuth();
  const { agents, loading: agentsLoading } = useAdminAgents();
  const [rootUserId, setRootUserId] = useState("");
  const [tree, setTree] = useState<Awaited<ReturnType<typeof getHierarchy>>["tree"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const agentOptions = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  useEffect(() => {
    document.title = "Hierarchy — PNCL Admin";
    trackPageView("admin_hierarchy");
  }, []);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getHierarchy(token, rootUserId || undefined)
      .then((data) => {
        if (!cancelled) setTree(data.tree);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load hierarchy");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, rootUserId]);

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <GitBranch size={22} aria-hidden="true" />
        <div>
          <h1>Referral hierarchy</h1>
          <p>Connection lines from upline to downline, based on referral links at onboarding.</p>
        </div>
      </div>

      <div className="admin-toolbar">
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
      </div>

      {(loading || agentsLoading) && (
        <div className="onboarding-spinner admin-spinner" aria-label="Loading hierarchy" />
      )}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && tree.length === 0 && (
        <p className="admin-empty">No referral connections found yet.</p>
      )}

      {!loading && !error && tree.length > 0 && <HierarchyCanvas tree={tree} />}
    </section>
  );
}
