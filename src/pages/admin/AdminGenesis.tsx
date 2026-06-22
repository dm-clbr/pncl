import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, GraduationCap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { markGenesisAccountCreated, type AgentSummary } from "@/lib/admin-api";
import { useAdminAgents } from "@/hooks/useAdminAgents";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

function formatGenesisDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminGenesis() {
  const { session } = useAuth();
  const { agents, loading, error, reload } = useAdminAgents();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"pending" | "created">("pending");
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Genesis accounts — PNCL Admin";
    trackPageView("admin_genesis");
  }, []);

  const filteredAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return agents.filter((agent) => {
      if (filter === "pending" && agent.genesisAccountCreatedAt) return false;
      if (filter === "created" && !agent.genesisAccountCreatedAt) return false;

      if (!normalized) return true;
      return agent.name.toLowerCase().includes(normalized)
        || agent.email.toLowerCase().includes(normalized);
    });
  }, [agents, filter, query]);

  const pendingCount = useMemo(
    () => agents.filter((agent) => !agent.genesisAccountCreatedAt).length,
    [agents],
  );

  const handleMarkCreated = async (agent: AgentSummary) => {
    const token = session?.access_token;
    if (!token) return;

    if (agent.genesisAccountCreatedAt) return;

    if (!window.confirm(`Mark Genesis account as created for ${agent.name}? They will see a notice on their dashboard.`)) {
      return;
    }

    setMarkingId(agent.id);
    try {
      const result = await markGenesisAccountCreated(token, agent.id);
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to mark Genesis account");
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <GraduationCap size={22} aria-hidden="true" />
        <div>
          <h1>Genesis accounts</h1>
          <p>Track Pinnacle Genesis provisioning and notify agents when their account is ready.</p>
        </div>
      </div>

      <div className="admin-toolbar">
        <label className="admin-field admin-field-grow">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or email"
          />
        </label>

        <label className="admin-field">
          <span>Status</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="pending">Pending ({pendingCount})</option>
            <option value="created">Created</option>
          </select>
        </label>
      </div>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading users" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Genesis status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => {
                const isMarking = markingId === agent.id;
                const isCreated = Boolean(agent.genesisAccountCreatedAt);

                return (
                  <tr key={agent.id}>
                    <td>{agent.name}</td>
                    <td>{agent.email}</td>
                    <td>
                      <span className={`admin-status${isCreated ? " active" : ""}`}>
                        {isCreated
                          ? `Created ${formatGenesisDate(agent.genesisAccountCreatedAt!)}`
                          : "Not created"}
                      </span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        {isCreated ? (
                          <span className="admin-inline-note">
                            <CheckCircle2 size={16} aria-hidden="true" />
                            Account created
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="admin-icon-btn"
                            disabled={isMarking}
                            onClick={() => void handleMarkCreated(agent)}
                          >
                            <Check size={16} aria-hidden="true" />
                            {isMarking ? "Saving…" : "Genesis account created"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredAgents.length === 0 && (
            <p className="admin-empty">No users match your filters.</p>
          )}
        </div>
      )}
    </section>
  );
}
