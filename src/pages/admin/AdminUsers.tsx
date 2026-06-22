import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shield, ShieldOff, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { updateUserRole, type AgentSummary } from "@/lib/admin-api";
import { useAdminAgents } from "@/hooks/useAdminAgents";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

function statusLabel(agent: AgentSummary): string {
  if (!agent.emailConfirmed) return "Pending activation";
  if (agent.status === "manual") return "Manual provision";
  if (agent.status) return agent.status.replace(/_/g, " ");
  return "Active";
}

export default function AdminUsers() {
  const { user, session } = useAuth();
  const { agents, loading, error, reload } = useAdminAgents();
  const [query, setQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Users — PNCL Admin";
    trackPageView("admin_users");
  }, []);

  const filteredAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return agents;
    return agents.filter((agent) =>
      agent.name.toLowerCase().includes(normalized)
      || agent.email.toLowerCase().includes(normalized)
      || (agent.referrerName?.toLowerCase().includes(normalized) ?? false),
    );
  }, [agents, query]);

  const handleRoleToggle = async (agent: AgentSummary) => {
    const token = session?.access_token;
    if (!token) return;

    const nextRole = agent.role === "admin" ? "agent" : "admin";
    const confirmMessage = nextRole === "admin"
      ? `Promote ${agent.name} to admin?`
      : `Remove admin access from ${agent.name}?`;

    if (!window.confirm(confirmMessage)) return;

    setUpdatingId(agent.id);
    try {
      const result = await updateUserRole(token, agent.id, nextRole);
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update role");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head admin-panel-head-row">
        <div className="admin-panel-head">
          <Users size={22} aria-hidden="true" />
          <div>
            <h1>User management</h1>
            <p>Review the current agent base and manage admin access.</p>
          </div>
        </div>
        <Link to="/portal/admin/users/new" className="admin-primary-btn">
          <UserPlus size={16} aria-hidden="true" />
          Add user
        </Link>
      </div>

      <div className="admin-toolbar">
        <label className="admin-field admin-field-grow">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, email, or upline"
          />
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
                <th>Upline</th>
                <th>Status</th>
                <th>Role</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => {
                const isSelf = agent.id === user?.id;
                const isUpdating = updatingId === agent.id;

                return (
                  <tr key={agent.id}>
                    <td>{agent.name}</td>
                    <td>{agent.email}</td>
                    <td>{agent.referrerName ?? agent.uplineNetwork ?? "—"}</td>
                    <td>
                      <span className={`admin-status${agent.emailConfirmed ? " active" : ""}`}>
                        {statusLabel(agent)}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-badge${agent.role === "admin" ? " accent" : ""}`}>
                        {agent.role}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-icon-btn"
                        disabled={isSelf || isUpdating}
                        title={isSelf ? "You cannot change your own role here" : undefined}
                        onClick={() => void handleRoleToggle(agent)}
                      >
                        {agent.role === "admin" ? (
                          <>
                            <ShieldOff size={16} aria-hidden="true" />
                            Remove admin
                          </>
                        ) : (
                          <>
                            <Shield size={16} aria-hidden="true" />
                            Make admin
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredAgents.length === 0 && (
            <p className="admin-empty">No users match your search.</p>
          )}
        </div>
      )}
    </section>
  );
}
