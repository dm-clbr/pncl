import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownAZ, ArrowUpAZ, Check, CheckCircle2, ClipboardList, GraduationCap, Mail, SkipForward, X } from "lucide-react";
import AdminOnboardingDetailsPanel from "@/components/admin/AdminOnboardingDetailsPanel";
import AdminUserDocumentsList from "@/components/admin/AdminUserDocumentsList";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAdminUserProfile,
  markGenesisAccountCreated,
  sendTestGenesisNotification,
  skipGenesisAccount,
  type AdminUserDocument,
  type AdminUserDirectDepositSummary,
  type AdminUserW9Summary,
  type AgentOnboardingDetails,
  type AgentSummary,
  type GenesisAccountStatus,
} from "@/lib/admin-api";
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

function formatGenesisDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resolveGenesisStatus(agent: AgentSummary): GenesisAccountStatus {
  if (agent.genesisStatus) return agent.genesisStatus;
  if (agent.genesisAccountCreatedAt) return "created";
  if (agent.genesisAccountSkippedAt) return "skipped";
  return "pending";
}

function formatGenesisStatusLabel(agent: AgentSummary): string {
  const status = resolveGenesisStatus(agent);
  if (status === "created" && agent.genesisAccountCreatedAt) {
    return `Created ${formatGenesisDate(agent.genesisAccountCreatedAt)}`;
  }
  if (status === "skipped" && agent.genesisAccountSkippedAt) {
    return `Skipped ${formatGenesisDate(agent.genesisAccountSkippedAt)}`;
  }
  if (status === "created") return "Created";
  if (status === "skipped") return "Skipped";
  return "Pending";
}

function genesisStatusClass(status: GenesisAccountStatus): string {
  if (status === "created") return " active";
  if (status === "skipped") return " skipped";
  return " pending";
}

function OnboardingDetailsPanel({
  onboarding,
  referrerName,
}: {
  onboarding: AgentOnboardingDetails;
  referrerName: string | null;
}) {
  return <AdminOnboardingDetailsPanel onboarding={onboarding} referrerName={referrerName} />;
}

function formatDocumentSummaryDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminGenesis() {
  const { session } = useAuth();
  const { agents, loading, error, reload } = useAdminAgents();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GenesisAccountStatus>("pending");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [detailAgent, setDetailAgent] = useState<AgentSummary | null>(null);
  const [detailDocuments, setDetailDocuments] = useState<AdminUserDocument[]>([]);
  const [detailW9, setDetailW9] = useState<AdminUserW9Summary | null>(null);
  const [detailDirectDeposit, setDetailDirectDeposit] = useState<AdminUserDirectDepositSummary | null>(null);
  const [detailDocumentsLoading, setDetailDocumentsLoading] = useState(false);
  const [detailDocumentsError, setDetailDocumentsError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Genesis accounts — PNCL Admin";
    trackPageView("admin_genesis");
  }, []);

  useEffect(() => {
    const token = session?.access_token;
    if (!token || !detailAgent) {
      setDetailDocuments([]);
      setDetailW9(null);
      setDetailDirectDeposit(null);
      setDetailDocumentsLoading(false);
      setDetailDocumentsError(null);
      return;
    }

    let cancelled = false;
    setDetailDocumentsLoading(true);
    setDetailDocumentsError(null);

    void getAdminUserProfile(token, detailAgent.id)
      .then((profile) => {
        if (cancelled) return;
        setDetailDocuments(profile.documents);
        setDetailW9(profile.w9);
        setDetailDirectDeposit(profile.directDeposit);
      })
      .catch((err) => {
        if (cancelled) return;
        setDetailDocuments([]);
        setDetailW9(null);
        setDetailDirectDeposit(null);
        setDetailDocumentsError(err instanceof Error ? err.message : "Unable to load documents");
      })
      .finally(() => {
        if (!cancelled) setDetailDocumentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailAgent, session?.access_token]);

  const refreshDetailDocuments = async () => {
    const token = session?.access_token;
    if (!token || !detailAgent) return;

    setDetailDocumentsLoading(true);
    setDetailDocumentsError(null);
    try {
      const profile = await getAdminUserProfile(token, detailAgent.id);
      setDetailDocuments(profile.documents);
      setDetailW9(profile.w9);
      setDetailDirectDeposit(profile.directDeposit);
    } catch (err) {
      setDetailDocumentsError(err instanceof Error ? err.message : "Unable to refresh documents");
    } finally {
      setDetailDocumentsLoading(false);
    }
  };

  const filteredAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return agents
      .filter((agent) => {
        if (resolveGenesisStatus(agent) !== filter) return false;

        if (!normalized) return true;
        return agent.name.toLowerCase().includes(normalized)
          || agent.email.toLowerCase().includes(normalized)
          || (agent.onboarding?.legalName.toLowerCase().includes(normalized) ?? false);
      })
      .sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();

        if (aTime !== bTime) {
          return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
        }
        return a.name.localeCompare(b.name);
      });
  }, [agents, filter, query, sortOrder]);

  const pendingCount = useMemo(
    () => agents.filter((agent) => resolveGenesisStatus(agent) === "pending").length,
    [agents],
  );

  const createdCount = useMemo(
    () => agents.filter((agent) => resolveGenesisStatus(agent) === "created").length,
    [agents],
  );

  const skippedCount = useMemo(
    () => agents.filter((agent) => resolveGenesisStatus(agent) === "skipped").length,
    [agents],
  );

  const handleSendTestEmail = async () => {
    const token = session?.access_token;
    if (!token) return;

    setSendingTestEmail(true);
    try {
      const result = await sendTestGenesisNotification(token);
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to send test notification");
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleSkip = async (agent: AgentSummary) => {
    const token = session?.access_token;
    if (!token) return;

    if (resolveGenesisStatus(agent) !== "pending") return;

    if (!window.confirm(`Skip Genesis account for ${agent.name}? They won't appear in the pending queue.`)) {
      return;
    }

    setSkippingId(agent.id);
    try {
      const result = await skipGenesisAccount(token, agent.id);
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to skip Genesis account");
    } finally {
      setSkippingId(null);
    }
  };

  const handleMarkCreated = async (agent: AgentSummary) => {
    const token = session?.access_token;
    if (!token) return;

    if (resolveGenesisStatus(agent) !== "pending") return;

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
          <select value={filter} onChange={(event) => setFilter(event.target.value as GenesisAccountStatus)}>
            <option value="pending">Pending ({pendingCount})</option>
            <option value="created">Created ({createdCount})</option>
            <option value="skipped">Skipped ({skippedCount})</option>
          </select>
        </label>

        <button
          type="button"
          className="admin-icon-btn"
          onClick={() => setSortOrder((current) => (current === "asc" ? "desc" : "asc"))}
          aria-label={sortOrder === "asc" ? "Sort oldest to newest" : "Sort newest to oldest"}
          title={sortOrder === "asc" ? "Oldest first — click for newest first" : "Newest first — click for oldest first"}
        >
          {sortOrder === "asc" ? (
            <ArrowDownAZ size={16} aria-hidden="true" />
          ) : (
            <ArrowUpAZ size={16} aria-hidden="true" />
          )}
          {sortOrder === "asc" ? "Oldest first" : "Newest first"}
        </button>

        <button
          type="button"
          className="admin-icon-btn"
          disabled={sendingTestEmail}
          onClick={() => void handleSendTestEmail()}
        >
          <Mail size={16} aria-hidden="true" />
          {sendingTestEmail ? "Sending…" : "Send test email"}
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
                <th>Account created</th>
                <th>Genesis status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => {
                const isMarking = markingId === agent.id;
                const isSkipping = skippingId === agent.id;
                const genesisStatus = resolveGenesisStatus(agent);
                const hasOnboarding = Boolean(agent.onboarding);

                return (
                  <tr key={agent.id}>
                    <td>{agent.name}</td>
                    <td>{agent.email}</td>
                    <td>{formatGenesisDateTime(agent.createdAt)}</td>
                    <td>
                      <span className={`admin-status${genesisStatusClass(genesisStatus)}`}>
                        {formatGenesisStatusLabel(agent)}
                      </span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={!hasOnboarding}
                          onClick={() => setDetailAgent(agent)}
                          aria-label={hasOnboarding ? `View onboarding details for ${agent.name}` : "No onboarding details available"}
                          title={hasOnboarding ? "View onboarding details" : "No onboarding details"}
                        >
                          <ClipboardList size={16} aria-hidden="true" />
                          Onboarding
                        </button>
                        {genesisStatus === "created" ? (
                          <span className="admin-inline-note">
                            <CheckCircle2 size={16} aria-hidden="true" />
                            Account created
                          </span>
                        ) : genesisStatus === "skipped" ? (
                          <span className="admin-inline-note muted">
                            <SkipForward size={16} aria-hidden="true" />
                            Skipped
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="admin-icon-btn"
                              disabled={isSkipping || isMarking}
                              onClick={() => void handleSkip(agent)}
                            >
                              <SkipForward size={16} aria-hidden="true" />
                              {isSkipping ? "Saving…" : "Skip"}
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn"
                              disabled={isMarking || isSkipping}
                              onClick={() => void handleMarkCreated(agent)}
                            >
                              <Check size={16} aria-hidden="true" />
                              {isMarking ? "Saving…" : "Genesis account created"}
                            </button>
                          </>
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

      {detailAgent && (
        <div
          className="admin-modal-overlay"
          role="presentation"
          onClick={() => setDetailAgent(null)}
        >
          <div
            className="admin-modal admin-genesis-details-modal"
            role="dialog"
            aria-labelledby="admin-genesis-details-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-head">
              <div>
                <h2 id="admin-genesis-details-title">Onboarding details</h2>
                <p>
                  Information collected during onboarding for {detailAgent.name}.
                </p>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                aria-label="Close"
                onClick={() => setDetailAgent(null)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {detailAgent.onboarding ? (
              <OnboardingDetailsPanel
                onboarding={detailAgent.onboarding}
                referrerName={detailAgent.referrerName}
              />
            ) : (
              <p className="admin-empty">No onboarding details are available for this user.</p>
            )}

            <div className="admin-genesis-details-documents">
              <div className="admin-panel-head admin-panel-head-row">
                <div>
                  <h3>Saved documents</h3>
                  <p>W-9, direct deposit, and other PDFs on this user&apos;s profile.</p>
                </div>
                <div className="admin-genesis-details-documents-actions">
                  <button
                    type="button"
                    className="admin-icon-btn"
                    disabled={detailDocumentsLoading}
                    onClick={() => void refreshDetailDocuments()}
                  >
                    {detailDocumentsLoading ? "Refreshing…" : "Refresh links"}
                  </button>
                  <Link to={`/portal/admin/users/${detailAgent.id}`} className="admin-icon-btn">
                    View full profile
                  </Link>
                </div>
              </div>

              {detailDocumentsLoading && detailDocuments.length === 0 && (
                <div className="portal-incentives-loading">
                  <span className="onboarding-spinner" aria-hidden="true" />
                  <span>Loading documents...</span>
                </div>
              )}

              {!detailDocumentsLoading && detailDocumentsError && (
                <p className="admin-error">{detailDocumentsError}</p>
              )}

              {!detailDocumentsError && (detailW9 || detailDirectDeposit) && (
                <dl className="admin-genesis-details-grid admin-user-form-status">
                  {detailW9 && (
                    <div className="admin-genesis-details-item">
                      <dt>Form W-9</dt>
                      <dd>
                        Signed {formatDocumentSummaryDate(detailW9.signedAt)} by {detailW9.signatureName}
                      </dd>
                    </div>
                  )}
                  {detailDirectDeposit && (
                    <div className="admin-genesis-details-item">
                      <dt>Direct deposit</dt>
                      <dd>
                        Signed {formatDocumentSummaryDate(detailDirectDeposit.signedAt)} —{" "}
                        {detailDirectDeposit.accountType === "checking" ? "Checking" : "Savings"} account
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              {!detailDocumentsError && (
                <AdminUserDocumentsList documents={detailDocuments} />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
