import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PhoneOff, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  listOnboardingHolds,
  releaseOnboardingHold,
  type OnboardingHold,
} from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}

function holdLabel(hold: OnboardingHold): string {
  if (hold.releasedAt) return `Released ${formatDate(hold.releasedAt)}`;
  if (hold.blocksNewApplication) {
    return hold.holdsSsn ? "Blocking phone + SSN" : "Blocking phone";
  }
  return "Not blocking";
}

export default function AdminOnboardingHolds() {
  const { session } = useAuth();
  const [holds, setHolds] = useState<OnboardingHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadHolds = useCallback(async (search: string) => {
    const token = session?.access_token;
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      setHolds(await listOnboardingHolds(token, search));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load onboarding holds");
      setHolds([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    document.title = "Onboarding holds — PNCL Admin";
    trackPageView("admin_onboarding_holds");
  }, []);

  useEffect(() => {
    void loadHolds(appliedQuery);
  }, [loadHolds, appliedQuery]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setAppliedQuery(query);
  };

  const handleToggleRelease = async (hold: OnboardingHold) => {
    const token = session?.access_token;
    if (!token) return;

    const releasing = hold.releasedAt === null;
    const confirmMessage = releasing
      ? `Release the hold on ${hold.phoneNumber}? ${hold.legalName} will be able to submit a new application.`
      : `Restore the hold on ${hold.phoneNumber}? New applications using this number will be blocked again.`;

    if (!window.confirm(confirmMessage)) return;

    setUpdatingId(hold.onboardingId);
    try {
      const result = await releaseOnboardingHold(token, {
        onboardingId: hold.onboardingId,
        released: releasing,
      });
      toast.success(result.message);
      await loadHolds(appliedQuery);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update onboarding hold");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <PhoneOff size={22} aria-hidden="true" />
        <div>
          <h1>Onboarding holds</h1>
          <p>
            Each application reserves the applicant's mobile number and SSN so a duplicate signup
            cannot burn the same number for Google account verification. When an agent is told their
            phone number is already linked to another PNCL account, find the record here and release
            it so they can apply again.
          </p>
        </div>
      </div>

      <form className="admin-toolbar" onSubmit={handleSearch}>
        <label className="admin-field admin-field-grow">
          <span>Search all applications</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Phone number, name, or email"
          />
        </label>

        <button type="submit" className="admin-primary-btn" disabled={loading}>
          Search
        </button>

        <button
          type="button"
          className="admin-icon-btn"
          disabled={loading}
          onClick={() => void loadHolds(appliedQuery)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </form>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading onboarding holds" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>PNCL email</th>
                <th>Upline</th>
                <th>Application status</th>
                <th>Hold</th>
                <th>Applied</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {holds.map((hold) => {
                const isUpdating = updatingId === hold.onboardingId;
                const releasing = hold.releasedAt === null;
                return (
                  <tr key={hold.onboardingId}>
                    <td>{hold.legalName}</td>
                    <td>{hold.phoneNumber}</td>
                    <td>{hold.workspaceEmail ?? "—"}</td>
                    <td>{hold.uplineNetwork ?? "—"}</td>
                    <td title={hold.googleCreationError ?? undefined}>
                      {formatStatus(hold.status)}
                      {hold.hasPortalAccount ? " · has portal account" : ""}
                    </td>
                    <td>{holdLabel(hold)}</td>
                    <td>{formatDate(hold.createdAt)}</td>
                    <td>
                      <div className="admin-action-row">
                        {hold.hasPortalAccount && hold.supabaseUserId && (
                          <Link
                            to={`/portal/admin/users/${hold.supabaseUserId}`}
                            className="admin-secondary-btn"
                          >
                            View user
                          </Link>
                        )}
                        <button
                          type="button"
                          className={releasing ? "admin-primary-btn" : "admin-secondary-btn"}
                          disabled={isUpdating || (releasing && hold.hasPortalAccount)}
                          title={releasing && hold.hasPortalAccount
                            ? "Delete the portal account first, which releases the hold automatically"
                            : undefined}
                          onClick={() => void handleToggleRelease(hold)}
                        >
                          {isUpdating
                            ? "Saving…"
                            : releasing
                              ? "Release hold"
                              : "Restore hold"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {holds.length === 0 && (
            <p className="admin-empty">
              {appliedQuery
                ? "No applications match this search."
                : "No stale holds. Every reserved phone number belongs to a live portal account."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
