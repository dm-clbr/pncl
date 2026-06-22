import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, UserCog, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { resendActivationEmail, updateUserRole, type AgentSummary } from "@/lib/admin-api";
import { useAdminAgents } from "@/hooks/useAdminAgents";
import { trackPageView } from "@/lib/analytics";
import { formatRoleLabel, type PortalRole } from "@/lib/roles";
import { toast } from "sonner";

function statusLabel(agent: AgentSummary): string {
  if (!agent.emailConfirmed) return "Pending activation";
  if (agent.status === "manual") return "Manual provision";
  if (agent.status) return agent.status.replace(/_/g, " ");
  return "Active";
}

const ELEVATED_ROLES: Array<{ value: PortalRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "genesis_admin", label: "Genesis admin" },
];

function roleChangeMessage(agent: AgentSummary, nextRole: PortalRole): string {
  if (nextRole === "admin") return `Set ${agent.name}'s role to admin?`;
  if (nextRole === "genesis_admin") return `Set ${agent.name}'s role to Genesis admin?`;
  return `Remove elevated access from ${agent.name}?`;
}

export default function AdminUsers() {
  const { user, session } = useAuth();
  const { agents, loading, error, reload } = useAdminAgents();
  const [query, setQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

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

  const handleResendActivation = async (agent: AgentSummary) => {
    const token = session?.access_token;
    if (!token) return;

    if (!window.confirm(`Send a new portal activation email to ${agent.name}?`)) return;

    setResendingId(agent.id);
    try {
      const result = await resendActivationEmail(token, agent.id);
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to resend activation email");
    } finally {
      setResendingId(null);
    }
  };

  const handleRoleChange = async (agent: AgentSummary, nextRole: PortalRole) => {
    const token = session?.access_token;
    if (!token || nextRole === agent.role) return;

    if (!window.confirm(roleChangeMessage(agent, nextRole))) return;

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

  const handleRoleSelect = (agent: AgentSummary, value: string) => {
    if (value === "agent") {
      void handleRoleChange(agent, "agent");
      return;
    }
    if (value === "admin" || value === "genesis_admin") {
      void handleRoleChange(agent, value);
    }
  };

  const roleBadgeClass = (role: PortalRole) => {
    if (role === "admin") return "admin-badge accent";
    if (role === "genesis_admin") return "admin-badge genesis";
    return "admin-badge";
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
                const isResending = resendingId === agent.id;

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
                      <span className={roleBadgeClass(agent.role)}>
                        {formatRoleLabel(agent.role)}
                      </span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        {!agent.emailConfirmed && (
                          <button
                            type="button"
                            className="admin-icon-btn"
                            disabled={isResending}
                            onClick={() => void handleResendActivation(agent)}
                          >
                            <Mail size={16} aria-hidden="true" />
                            {isResending ? "Sending…" : "Resend activation"}
                          </button>
                        )}
                        {!isSelf && (
                          <label className="admin-role-update">
                            <UserCog size={16} aria-hidden="true" />
                            <select
                              className="admin-role-select"
                              value={agent.role === "agent" ? "" : agent.role}
                              disabled={isUpdating}
                              aria-label={`Update role for ${agent.name}`}
                              onChange={(event) => {
                                const { value } = event.target;
                                event.target.value = agent.role === "agent" ? "" : agent.role;
                                handleRoleSelect(agent, value);
                              }}
                            >
                              <option value="" disabled>
                                {isUpdating ? "Updating…" : "Update role"}
                              </option>
                              {ELEVATED_ROLES.map(({ value, label }) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                              {agent.role !== "agent" && (
                                <option value="agent">Remove elevated access</option>
                              )}
                            </select>
                          </label>
                        )}
                      </div>
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
