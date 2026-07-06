import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  listGmailVerificationCandidates,
  notifySuspendedGmailUsers,
  reactivateGoogleUser,
  sendGmailVerificationEmail,
  type GmailVerificationCandidate,
  type GoogleWorkspaceStatus,
} from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
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

function canSendGmailVerification(candidate: GmailVerificationCandidate): boolean {
  return candidate.googleWorkspaceStatus === "auto_suspended";
}

function canReactivateGoogle(candidate: GmailVerificationCandidate): boolean {
  return candidate.googleWorkspaceStatus === "auto_suspended"
    || candidate.googleWorkspaceStatus === "suspended";
}

export default function AdminGmailVerification() {
  const { session } = useAuth();
  const [candidates, setCandidates] = useState<GmailVerificationCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [previewingAll, setPreviewingAll] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);

  const loadCandidates = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const data = await listGmailVerificationCandidates(token);
      setCandidates(data.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Gmail verification queue");
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    document.title = "Gmail verification — PNCL Admin";
    trackPageView("admin_gmail_verification");
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const filteredCandidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return candidates;
    return candidates.filter((candidate) =>
      candidate.legalName.toLowerCase().includes(normalized)
      || candidate.workspaceEmail.toLowerCase().includes(normalized)
      || candidate.personalEmail.toLowerCase().includes(normalized),
    );
  }, [candidates, query]);

  const handleSendOne = async (candidate: GmailVerificationCandidate, forceResend = false) => {
    const token = session?.access_token;
    if (!token) return;

    if (!canSendGmailVerification(candidate)) {
      toast.error("Gmail verification emails can only be sent for auto-suspended Google accounts.");
      return;
    }

    const confirmMessage = forceResend
      ? `Resend Gmail verification instructions to ${candidate.personalEmail}?`
      : `Send Gmail verification instructions to ${candidate.personalEmail}?`;

    if (!window.confirm(confirmMessage)) return;

    setSendingId(candidate.onboardingId);
    try {
      const result = await sendGmailVerificationEmail(token, {
        onboardingId: candidate.onboardingId,
        forceResend,
      });
      toast.success(result.message);
      await loadCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to send Gmail verification email");
    } finally {
      setSendingId(null);
    }
  };

  const handleReactivateOne = async (candidate: GmailVerificationCandidate) => {
    const token = session?.access_token;
    if (!token) return;

    if (!canReactivateGoogle(candidate)) return;

    if (!window.confirm(`Reactivate ${candidate.workspaceEmail} in Google Workspace?`)) return;

    setReactivatingId(candidate.onboardingId);
    try {
      const result = await reactivateGoogleUser(token, { onboardingId: candidate.onboardingId });
      toast.success(result.message);
      await loadCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to reactivate Google account");
    } finally {
      setReactivatingId(null);
    }
  };

  const handlePreviewAll = async () => {
    const token = session?.access_token;
    if (!token) return;

    setPreviewingAll(true);
    try {
      const result = await notifySuspendedGmailUsers(token, { dryRun: true });
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to preview suspended Gmail emails");
    } finally {
      setPreviewingAll(false);
    }
  };

  const handleSendAll = async () => {
    const token = session?.access_token;
    if (!token) return;

    if (!window.confirm(
      "Send Gmail verification emails to all automatically suspended onboarding accounts that have not received one yet?",
    )) {
      return;
    }

    setSendingAll(true);
    try {
      const result = await notifySuspendedGmailUsers(token, { dryRun: false });
      toast.success(result.message);
      await loadCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to send suspended Gmail emails");
    } finally {
      setSendingAll(false);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <Mail size={22} aria-hidden="true" />
        <div>
          <h1>Gmail verification</h1>
          <p>
            Send personal-email instructions for automatically suspended PNCL Gmail accounts so agents
            can verify Google sign-in and create their first password.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <label className="admin-field admin-field-grow">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, PNCL email, or personal email"
          />
        </label>

        <button
          type="button"
          className="admin-icon-btn"
          disabled={loading}
          onClick={() => void loadCandidates()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>

        <button
          type="button"
          className="admin-icon-btn"
          disabled={previewingAll}
          onClick={() => void handlePreviewAll()}
        >
          <Mail size={16} aria-hidden="true" />
          {previewingAll ? "Checking…" : "Preview auto-suspended"}
        </button>

        <button
          type="button"
          className="admin-primary-btn"
          disabled={sendingAll}
          onClick={() => void handleSendAll()}
        >
          {sendingAll ? "Sending…" : "Send to auto-suspended"}
        </button>
      </div>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading Gmail verification queue" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>PNCL email</th>
                <th>Personal email</th>
                <th>Onboarding status</th>
                <th>Google status</th>
                <th>Verification email sent</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.map((candidate) => {
                const isSending = sendingId === candidate.onboardingId;
                const isReactivating = reactivatingId === candidate.onboardingId;
                const sendAllowed = canSendGmailVerification(candidate);
                const reactivateAllowed = canReactivateGoogle(candidate);
                return (
                  <tr key={candidate.onboardingId}>
                    <td>{candidate.legalName}</td>
                    <td>{candidate.workspaceEmail}</td>
                    <td>{candidate.personalEmail}</td>
                    <td>{formatStatus(candidate.status)}</td>
                    <td title={candidate.googleSuspensionReason ?? undefined}>
                      {googleStatusLabel(candidate.googleWorkspaceStatus)}
                    </td>
                    <td>{formatDateTime(candidate.gmailVerificationEmailSentAt)}</td>
                    <td>
                      <div className="admin-action-row">
                        {candidate.supabaseUserId && (
                          <Link
                            to={`/portal/admin/users/${candidate.supabaseUserId}`}
                            className="admin-secondary-btn"
                          >
                            View user
                          </Link>
                        )}
                        {reactivateAllowed && (
                          <button
                            type="button"
                            className="admin-secondary-btn"
                            disabled={isReactivating}
                            onClick={() => void handleReactivateOne(candidate)}
                          >
                            {isReactivating ? "Reactivating…" : "Reactivate"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-primary-btn"
                          disabled={isSending || !sendAllowed}
                          title={sendAllowed ? undefined : "Only auto-suspended Google accounts can receive verification email"}
                          onClick={() => void handleSendOne(candidate, Boolean(candidate.gmailVerificationEmailSentAt))}
                        >
                          {isSending
                            ? "Sending…"
                            : !sendAllowed
                              ? "Not auto-suspended"
                              : candidate.gmailVerificationEmailSentAt
                                ? "Resend verification email"
                                : "Send verification email"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredCandidates.length === 0 && (
            <p className="admin-empty">No onboarding records match this search.</p>
          )}
        </div>
      )}
    </section>
  );
}
