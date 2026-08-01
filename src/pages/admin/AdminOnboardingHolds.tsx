import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ClipboardCopy, RefreshCw, RotateCcw, Workflow } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  createEnrollmentResumeLink,
  listOnboardingHolds,
  releaseOnboardingHold,
  retryOnboardingEnrollment,
  type OnboardingHold,
} from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

function formatDateTime(value: string | null): string {
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

function shortId(value: string | null): string {
  if (!value) return "—";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function privatePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `(${digits.slice(0, 3)}) •••-${digits.slice(-4)}` : "••••";
}

function holdLabel(hold: OnboardingHold): string {
  if (hold.releasedAt) return `Released ${formatDateTime(hold.releasedAt)}`;
  if (hold.blocksNewApplication) return hold.holdsSsn ? "Phone + SSN reserved" : "Phone reserved";
  return "Not reserved";
}

function StepList({ hold }: { hold: OnboardingHold }) {
  const steps = [
    ["Referral", hold.referralStatus, hold.referralValidatedAt],
    ["Contract", hold.contractStatus, hold.contractSignedAt],
    ["Application", hold.applicationStatus, hold.applicationSavedAt],
    ["Google", hold.googleAccountStatus, hold.googleProvisionedAt],
    ["Portal", hold.portalAccountStatus, hold.portalLinkedAt],
    ["Finalization", hold.finalizationStatus, hold.finalizedAt],
    ["Ready", hold.enrollmentStatus === "ready" ? "ready" : "pending", hold.finalizedAt],
  ] as const;

  return (
    <ol style={{ margin: 0, paddingLeft: "1.15rem", minWidth: "13rem" }}>
      {steps.map(([label, status, timestamp]) => (
        <li key={label} title={formatDateTime(timestamp)}>
          <strong>{label}:</strong> {formatStatus(status)}
        </li>
      ))}
    </ol>
  );
}

export default function AdminOnboardingHolds() {
  const { session } = useAuth();
  const [holds, setHolds] = useState<OnboardingHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const visibleHolds = useMemo(
    () => attentionOnly ? holds.filter((hold) => hold.needsAttention) : holds,
    [attentionOnly, holds],
  );

  const loadHolds = useCallback(async (search: string) => {
    const token = session?.access_token;
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setHolds(await listOnboardingHolds(token, search));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load enrollments");
      setHolds([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    document.title = "Agent enrollments — PNCL Admin";
    trackPageView("admin_onboarding_enrollments");
  }, []);

  useEffect(() => { void loadHolds(appliedQuery); }, [loadHolds, appliedQuery]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setAppliedQuery(query);
  };

  const runAction = async (hold: OnboardingHold, action: () => Promise<void>) => {
    setUpdatingId(hold.onboardingId);
    try {
      await action();
      await loadHolds(appliedQuery);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update enrollment");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRetry = (hold: OnboardingHold) => runAction(hold, async () => {
    const token = session?.access_token;
    if (!token) return;
    const response = await retryOnboardingEnrollment(token, hold.onboardingId);
    toast.success(response.message || "Retry completed");
  });

  const handleResume = (hold: OnboardingHold) => runAction(hold, async () => {
    const token = session?.access_token;
    if (!token) return;
    const response = await createEnrollmentResumeLink(token, hold.onboardingId);
    await navigator.clipboard.writeText(response.resumeUrl);
    toast.success("24-hour resume link copied");
  });

  const handleToggleRelease = (hold: OnboardingHold) => runAction(hold, async () => {
    const token = session?.access_token;
    if (!token) return;
    const releasing = hold.releasedAt === null;
    if (!window.confirm(releasing
      ? `Release the identity reservation for ${hold.legalName}?`
      : `Restore the identity reservation for ${hold.legalName}?`)) return;
    const result = await releaseOnboardingHold(token, {
      onboardingId: hold.onboardingId,
      released: releasing,
    });
    toast.success(result.message);
  });

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <Workflow size={22} aria-hidden="true" />
        <div>
          <h1>Agent enrollments</h1>
          <p>
            Follow every enrollment from referral validation through readiness. Failed steps are safe
            to retry; resume links last 24 hours. Sensitive SSNs, password material, and identity hashes
            are never shown here.
          </p>
        </div>
      </div>

      <form className="admin-toolbar" onSubmit={handleSearch}>
        <label className="admin-field admin-field-grow">
          <span>Search enrollments</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Phone, name, or email" />
        </label>
        <label className="admin-field">
          <span>Queue</span>
          <select value={attentionOnly ? "attention" : "all"} onChange={(event) => setAttentionOnly(event.target.value === "attention")}>
            <option value="all">All recent</option>
            <option value="attention">Needs attention</option>
          </select>
        </label>
        <button type="submit" className="admin-primary-btn" disabled={loading}>Search</button>
        <button type="button" className="admin-icon-btn" disabled={loading} onClick={() => void loadHolds(appliedQuery)}>
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </button>
      </form>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading enrollments" />}
      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Enrollment</th>
                <th>Progress</th>
                <th>Attention</th>
                <th>Reservation</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleHolds.map((hold) => {
                const isUpdating = updatingId === hold.onboardingId;
                const canRelease = !hold.hasGoogleAccount && !hold.hasPortalAccount;
                return (
                  <tr key={hold.onboardingId}>
                    <td>
                      <strong>{hold.legalName}</strong><br />
                      <span title={hold.phoneNumber}>{privatePhone(hold.phoneNumber)}</span><br />
                      {hold.workspaceEmail ?? "No PNCL email yet"}
                    </td>
                    <td>
                      <code title={hold.onboardingId}>{shortId(hold.onboardingId)}</code>
                      <details>
                        <summary>Identifiers</summary>
                        <small>
                          Referral: <code title={hold.referralInviteId ?? undefined}>{shortId(hold.referralInviteId)}</code><br />
                          Contract: <code title={hold.contractSignatureId ?? undefined}>{shortId(hold.contractSignatureId)}</code><br />
                          Google: <code title={hold.googleUserId ?? undefined}>{shortId(hold.googleUserId)}</code><br />
                          Portal: <code title={hold.supabaseUserId ?? undefined}>{shortId(hold.supabaseUserId)}</code>
                        </small>
                      </details>
                    </td>
                    <td><StepList hold={hold} /></td>
                    <td>
                      {hold.needsAttention ? (
                        <>
                          <strong><AlertTriangle size={15} aria-hidden="true" /> {formatStatus(hold.failedStep ?? "unknown step")}</strong><br />
                          <span>{formatStatus(hold.failureCode ?? "needs review")}</span>
                          {hold.failureDetail && <details><summary>Diagnostic</summary><small>{hold.failureDetail}</small></details>}
                        </>
                      ) : formatStatus(hold.enrollmentStatus)}
                    </td>
                    <td>{holdLabel(hold)}</td>
                    <td>{formatDateTime(hold.updatedAt)}<br /><small>Attempts: {hold.provisioningAttempts}</small></td>
                    <td>
                      <div className="admin-action-row">
                        {hold.hasPortalAccount && hold.supabaseUserId && <Link to={`/portal/admin/users/${hold.supabaseUserId}`} className="admin-secondary-btn">View user</Link>}
                        {hold.needsAttention && (
                          <button type="button" className="admin-primary-btn" disabled={isUpdating} onClick={() => void handleRetry(hold)}>
                            <RotateCcw size={14} aria-hidden="true" /> Retry step
                          </button>
                        )}
                        {hold.enrollmentStatus !== "ready" && (
                          <button type="button" className="admin-secondary-btn" disabled={isUpdating} onClick={() => void handleResume(hold)}>
                            <ClipboardCopy size={14} aria-hidden="true" /> Copy resume
                          </button>
                        )}
                        {(hold.blocksNewApplication
                          || hold.releasedAt
                          || (canRelease && hold.enrollmentStatus !== "ready")) && (
                          <button
                            type="button"
                            className="admin-secondary-btn"
                            disabled={isUpdating || (hold.releasedAt === null && !canRelease)}
                            title={!canRelease ? "Retire the external Google/portal account first" : undefined}
                            onClick={() => void handleToggleRelease(hold)}
                          >
                            {hold.releasedAt ? "Restore reservation" : "Release stale reservation"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleHolds.length === 0 && <p className="admin-empty">No enrollments match this view.</p>}
        </div>
      )}
    </section>
  );
}
