import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { UserPlus, Users, X } from "lucide-react";
import AdminUserRowActionsMenu from "@/components/admin/AdminUserRowActionsMenu";
import { useAuth } from "@/contexts/AuthContext";
import {
  backfillGoogleRecovery,
  backfillGoogleRecoveryAll,
  deleteUser,
  resendActivationEmail,
  sendGmailVerificationEmail,
  updateUserCompLevel,
  updateUserEmail,
  updateUserRole,
  type AgentSummary,
  type GoogleWorkspaceStatus,
} from "@/lib/admin-api";
import { AdminCompLevelSelect } from "@/components/admin/AdminCompLevelSelect";
import { useAdminAgents } from "@/hooks/useAdminAgents";
import { trackPageView } from "@/lib/analytics";
import { formatRoleLabel, type PortalRole } from "@/lib/roles";
import { toast } from "sonner";

function statusLabel(agent: AgentSummary): string {
  if (!agent.hasOnboardingRecord && !agent.emailConfirmed) return "Pending activation";
  if (!agent.hasOnboardingRecord) return "Manual account";
  if (!agent.emailConfirmed) return "Pending activation";
  if (agent.status === "manual") return "Manual provision";
  if (agent.status) return agent.status.replace(/_/g, " ");
  return "Active";
}

function googleStatusLabel(status: GoogleWorkspaceStatus | null | undefined): string {
  switch (status) {
    case "active":
      return "Active";
    case "auto_suspended":
      return "Auto-suspended";
    case "suspended":
      return "Suspended";
    case "not_found":
      return "Not in Google";
    default:
      return "Unknown";
  }
}

function googleStatusClass(status: GoogleWorkspaceStatus | null | undefined): string {
  switch (status) {
    case "active":
      return " active";
    case "auto_suspended":
      return " error";
    case "suspended":
      return " error";
    case "not_found":
      return " skipped";
    default:
      return "";
  }
}

function roleChangeMessage(agent: AgentSummary, nextRole: PortalRole): string {
  if (nextRole === "admin") return `Set ${agent.name}'s role to admin?`;
  if (nextRole === "genesis_admin") return `Set ${agent.name}'s role to Genesis admin?`;
  return `Remove elevated access from ${agent.name}?`;
}

type GoogleStatusFilter = "all" | GoogleWorkspaceStatus | "unknown";

function matchesGoogleStatusFilter(
  agent: AgentSummary,
  filter: GoogleStatusFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "unknown") return !agent.googleWorkspaceStatus;
  return agent.googleWorkspaceStatus === filter;
}

export default function AdminUsers() {
  const { user, session } = useAuth();
  const { agents, loading, error, reload } = useAdminAgents();
  const [query, setQuery] = useState("");
  const [googleFilter, setGoogleFilter] = useState<GoogleStatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [sendingGmailVerificationId, setSendingGmailVerificationId] = useState<string | null>(null);
  const [syncingRecoveryId, setSyncingRecoveryId] = useState<string | null>(null);
  const [previewingRecoverySync, setPreviewingRecoverySync] = useState(false);
  const [syncingAllRecovery, setSyncingAllRecovery] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [emailEditAgent, setEmailEditAgent] = useState<AgentSummary | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [updatingCompId, setUpdatingCompId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Users — PNCL Admin";
    trackPageView("admin_users");
  }, []);

  const filteredAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return agents.filter((agent) => {
      if (!matchesGoogleStatusFilter(agent, googleFilter)) return false;
      if (!normalized) return true;
      return agent.name.toLowerCase().includes(normalized)
        || agent.email.toLowerCase().includes(normalized)
        || (agent.referrerName?.toLowerCase().includes(normalized) ?? false);
    });
  }, [agents, query, googleFilter]);

  const googleFilterCounts = useMemo(() => ({
    all: agents.length,
    active: agents.filter((agent) => agent.googleWorkspaceStatus === "active").length,
    auto_suspended: agents.filter((agent) => agent.googleWorkspaceStatus === "auto_suspended").length,
    suspended: agents.filter((agent) => agent.googleWorkspaceStatus === "suspended").length,
    not_found: agents.filter((agent) => agent.googleWorkspaceStatus === "not_found").length,
    unknown: agents.filter((agent) => !agent.googleWorkspaceStatus).length,
  }), [agents]);

  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );

  const handleResendActivation = async (agent: AgentSummary) => {
    const token = session?.access_token;
    if (!token) return;

    if (!window.confirm(`Send a portal welcome email to ${agent.name}?`)) return;

    setResendingId(agent.id);
    try {
      const result = await resendActivationEmail(token, agent.id);
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to resend welcome email");
    } finally {
      setResendingId(null);
    }
  };

  const handleSendGmailVerification = async (agent: AgentSummary) => {
    const token = session?.access_token;
    if (!token) return;

    const destination = agent.personalEmail ?? "the agent's personal email";
    const actionLabel = agent.gmailVerificationEmailSentAt ? "Resend" : "Send";
    if (!window.confirm(`${actionLabel} Gmail verification instructions to ${destination}?`)) return;

    setSendingGmailVerificationId(agent.id);
    try {
      const result = await sendGmailVerificationEmail(token, {
        userId: agent.id,
        forceResend: Boolean(agent.gmailVerificationEmailSentAt),
      });
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to send Gmail verification email");
    } finally {
      setSendingGmailVerificationId(null);
    }
  };

  const handleSyncGoogleRecovery = async (agent: AgentSummary) => {
    const token = session?.access_token;
    if (!token) return;

    const destination = agent.personalEmail ?? "the agent's personal email";
    if (!window.confirm(`Push Google recovery email and phone to ${agent.email} using ${destination}?`)) return;

    setSyncingRecoveryId(agent.id);
    try {
      const result = await backfillGoogleRecovery(token, { userId: agent.id });
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to sync Google recovery info");
    } finally {
      setSyncingRecoveryId(null);
    }
  };

  const handlePreviewRecoverySync = async () => {
    const token = session?.access_token;
    if (!token) return;

    setPreviewingRecoverySync(true);
    try {
      const result = await backfillGoogleRecoveryAll(token, { dryRun: true });
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to preview Google recovery sync");
    } finally {
      setPreviewingRecoverySync(false);
    }
  };

  const handleSyncAllRecovery = async () => {
    const token = session?.access_token;
    if (!token) return;

    if (!window.confirm(
      "Push personal recovery email and phone to all Google Workspace accounts with onboarding records?",
    )) {
      return;
    }

    setSyncingAllRecovery(true);
    try {
      const result = await backfillGoogleRecoveryAll(token, { dryRun: false });
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to sync Google recovery info");
    } finally {
      setSyncingAllRecovery(false);
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

  const handleRoleSelect = (agent: AgentSummary, nextRole: PortalRole) => {
    void handleRoleChange(agent, nextRole);
  };

  const handleCompLevelChange = async (agent: AgentSummary, compLevel: number | null) => {
    const token = session?.access_token;
    if (!token) return;
    if (compLevel === agent.compLevel) return;

    setUpdatingCompId(agent.id);
    try {
      const result = await updateUserCompLevel(token, agent.id, compLevel);
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update comp level");
    } finally {
      setUpdatingCompId(null);
    }
  };

  const openEmailEditor = (agent: AgentSummary) => {
    setEmailEditAgent(agent);
    setEmailDraft(agent.email);
  };

  const closeEmailEditor = () => {
    if (savingEmail) return;
    setEmailEditAgent(null);
    setEmailDraft("");
  };

  const handleSaveEmail = async (event: FormEvent) => {
    event.preventDefault();
    const token = session?.access_token;
    if (!token || !emailEditAgent) return;

    const nextEmail = emailDraft.trim().toLowerCase();
    if (!nextEmail || nextEmail === emailEditAgent.email) {
      closeEmailEditor();
      return;
    }

    if (!window.confirm(`Update ${emailEditAgent.name}'s portal email to ${nextEmail}?`)) return;

    setSavingEmail(true);
    try {
      const result = await updateUserEmail(token, emailEditAgent.id, nextEmail);
      toast.success(result.message);
      closeEmailEditor();
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update email");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleDeleteUser = async (agent: AgentSummary) => {
    const token = session?.access_token;
    if (!token) return;

    const message = agent.emailConfirmed
      ? `Delete ${agent.name}'s portal account (${agent.email})? This removes their portal login and profile data. Update or remove their Google Workspace account separately.`
      : `Delete ${agent.name}'s pending portal account (${agent.email})?`;

    if (!window.confirm(message)) return;

    setDeletingId(agent.id);
    try {
      const result = await deleteUser(token, agent.id);
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete user");
    } finally {
      setDeletingId(null);
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
            <p>Review agents, manage admin access, sync portal emails, and remove accounts.</p>
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

        <label className="admin-field">
          <span>Google status</span>
          <select
            value={googleFilter}
            onChange={(event) => setGoogleFilter(event.target.value as GoogleStatusFilter)}
          >
            <option value="all">All ({googleFilterCounts.all})</option>
            <option value="active">Active ({googleFilterCounts.active})</option>
            <option value="auto_suspended">Auto-suspended ({googleFilterCounts.auto_suspended})</option>
            <option value="suspended">Suspended ({googleFilterCounts.suspended})</option>
            <option value="not_found">Not in Google ({googleFilterCounts.not_found})</option>
            <option value="unknown">Unknown ({googleFilterCounts.unknown})</option>
          </select>
        </label>

        <button
          type="button"
          className="admin-icon-btn"
          disabled={previewingRecoverySync || syncingAllRecovery}
          onClick={() => void handlePreviewRecoverySync()}
        >
          {previewingRecoverySync ? "Checking…" : "Preview recovery sync"}
        </button>

        <button
          type="button"
          className="admin-secondary-btn"
          disabled={syncingAllRecovery || previewingRecoverySync}
          onClick={() => void handleSyncAllRecovery()}
        >
          {syncingAllRecovery ? "Syncing…" : "Sync all Google recovery"}
        </button>
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
                <th>Comp</th>
                <th>Status</th>
                <th>Google</th>
                <th>Role</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => {
                const isSelf = agent.id === user?.id;
                const isUpdating = updatingId === agent.id;
                const isUpdatingComp = updatingCompId === agent.id;
                const isResending = resendingId === agent.id;
                const isSendingGmailVerification = sendingGmailVerificationId === agent.id;
                const isSyncingRecovery = syncingRecoveryId === agent.id;
                const isDeleting = deletingId === agent.id;

                return (
                  <tr key={agent.id}>
                    <td>
                      <Link to={`/portal/admin/users/${agent.id}`} className="admin-user-link">
                        {agent.name}
                      </Link>
                    </td>
                    <td>{agent.email}</td>
                    <td>{agent.referrerName ?? agent.uplineNetwork ?? "—"}</td>
                    <td>
                      <AdminCompLevelSelect
                        agent={agent}
                        agentsById={agentsById}
                        disabled={isDeleting}
                        saving={isUpdatingComp}
                        onChange={(compLevel) => void handleCompLevelChange(agent, compLevel)}
                      />
                    </td>
                    <td>
                      <span className={`admin-status${agent.emailConfirmed ? " active" : ""}`}>
                        {statusLabel(agent)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`admin-status${googleStatusClass(agent.googleWorkspaceStatus)}`}
                        title={agent.googleSuspensionReason ?? undefined}
                      >
                        {googleStatusLabel(agent.googleWorkspaceStatus)}
                      </span>
                    </td>
                    <td>
                      <span className={roleBadgeClass(agent.role)}>
                        {formatRoleLabel(agent.role)}
                      </span>
                    </td>
                    <td>
                      <AdminUserRowActionsMenu
                        agent={agent}
                        isSelf={isSelf}
                        savingEmail={savingEmail}
                        isResending={isResending}
                        isSendingGmailVerification={isSendingGmailVerification}
                        isSyncingRecovery={isSyncingRecovery}
                        isUpdating={isUpdating}
                        isDeleting={isDeleting}
                        onEditEmail={openEmailEditor}
                        onResendActivation={handleResendActivation}
                        onSendGmailVerification={handleSendGmailVerification}
                        onSyncGoogleRecovery={handleSyncGoogleRecovery}
                        onRoleChange={handleRoleSelect}
                        onDelete={handleDeleteUser}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredAgents.length === 0 && (
            <p className="admin-empty">No users match your search or filters.</p>
          )}
        </div>
      )}

      {emailEditAgent && (
        <div
          className="admin-modal-overlay"
          role="presentation"
          onClick={closeEmailEditor}
        >
          <form
            className="admin-modal admin-user-email-modal"
            role="dialog"
            aria-labelledby="admin-edit-email-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleSaveEmail(event)}
          >
            <div className="admin-modal-head">
              <div>
                <h2 id="admin-edit-email-title">Update portal email</h2>
                <p>
                  Change the email for {emailEditAgent.name}. Update their Google Workspace address
                  first, then enter the matching @thepncl.com address here.
                </p>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                aria-label="Close"
                disabled={savingEmail}
                onClick={closeEmailEditor}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <label className="admin-field">
              <span>Portal email</span>
              <input
                type="email"
                value={emailDraft}
                required
                autoComplete="off"
                disabled={savingEmail}
                onChange={(event) => setEmailDraft(event.target.value)}
              />
            </label>

            <div className="admin-form-actions">
              <button
                type="button"
                className="admin-secondary-btn"
                disabled={savingEmail}
                onClick={closeEmailEditor}
              >
                Cancel
              </button>
              <button type="submit" className="admin-primary-btn" disabled={savingEmail}>
                {savingEmail ? "Saving…" : "Save email"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
