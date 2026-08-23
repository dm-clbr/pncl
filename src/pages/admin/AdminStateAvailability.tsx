import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPinned, RotateCcw, Save } from "lucide-react";
import { useAdminStateAvailability } from "@/hooks/useAdminStateAvailability";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import {
  STATE_AVAILABILITY_META,
  STATE_AVAILABILITY_STATUSES,
  countStateAvailability,
  type StateAvailabilityStatus,
} from "@/lib/portal-state-availability";
import type { UsStateCode } from "@/lib/us-states";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

type StatusDraft = Record<UsStateCode, StateAvailabilityStatus>;

export default function AdminStateAvailability() {
  const { states, loading, error, reload, save } = useAdminStateAvailability();
  const [draft, setDraft] = useState<Partial<StatusDraft>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "State Availability — PNCL Admin";
    trackPageView("admin_state_availability");
  }, []);

  useEffect(() => {
    setDraft(Object.fromEntries(states.map((state) => [state.stateCode, state.status])));
  }, [states]);

  const changes = useMemo(
    () => states
      .filter((state) => draft[state.stateCode] && draft[state.stateCode] !== state.status)
      .map((state) => ({
        stateCode: state.stateCode,
        status: draft[state.stateCode] as StateAvailabilityStatus,
      })),
    [draft, states],
  );
  const isDirty = changes.length > 0;

  const draftStates = useMemo(
    () => states.map((state) => ({
      ...state,
      status: draft[state.stateCode] ?? state.status,
    })),
    [draft, states],
  );
  const counts = useMemo(() => countStateAvailability(draftStates), [draftStates]);

  const discard = useCallback(() => {
    setDraft(Object.fromEntries(states.map((state) => [state.stateCode, state.status])));
  }, [states]);

  const handleSave = useCallback(async () => {
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const result = await save(changes);
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save state availability.");
    } finally {
      setSaving(false);
    }
  }, [changes, save]);

  const handleAttemptLeave = useCallback(async (): Promise<"stay" | "leave"> => {
    if (!window.confirm("Discard unsaved state availability changes?")) return "stay";
    return "leave";
  }, []);

  useUnsavedChangesGuard(isDirty, handleAttemptLeave);

  return (
    <section className="admin-panel">
      <div className="admin-panel-head-row">
        <div className="admin-panel-head">
          <MapPinned size={22} aria-hidden="true" />
          <div>
            <h1>State availability</h1>
            <p>
              Set PNCL&apos;s company-wide operating status for every supported U.S. jurisdiction. These
              statuses are separate from each agent&apos;s personal licenses.
            </p>
          </div>
        </div>
        <div className="admin-panel-head-actions">
          <button
            type="button"
            className="admin-secondary-btn"
            onClick={discard}
            disabled={!isDirty || saving}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Discard
          </button>
          <button
            type="button"
            className="admin-primary-btn"
            onClick={() => void handleSave()}
            disabled={!isDirty || saving}
          >
            <Save size={16} aria-hidden="true" />
            {saving ? "Saving…" : `Save changes${changes.length ? ` (${changes.length})` : ""}`}
          </button>
        </div>
      </div>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading" />}

      {!loading && error && (
        <div className="admin-empty">
          <p className="admin-error" role="alert">{error}</p>
          <button type="button" className="admin-secondary-btn" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="admin-stats state-availability-admin-stats" aria-label="Draft status totals">
            {STATE_AVAILABILITY_STATUSES.map((status) => (
              <div className={`admin-stat state-status-${status.toLowerCase()}`} key={status}>
                <strong>{counts[status]}</strong>
                <span>{status}</span>
              </div>
            ))}
          </div>

          <p className="state-availability-admin-note" id="state-availability-help">
            Supported jurisdictions start Inactive. Change one only when PNCL&apos;s
            operating availability is confirmed.
          </p>

          <div className="admin-table-wrap">
            <table className="admin-table state-availability-admin-table">
              <thead>
                <tr>
                  <th scope="col">State / jurisdiction</th>
                  <th scope="col">Company status</th>
                  <th scope="col">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {states.map((state) => {
                  const status = draft[state.stateCode] ?? state.status;
                  const changed = status !== state.status;
                  return (
                    <tr key={state.stateCode} className={changed ? "state-row-changed" : undefined}>
                      <th scope="row">
                        <span className="state-admin-name">{state.stateName}</span>
                        <span className="state-admin-code">{state.stateCode}</span>
                        {changed && <span className="state-admin-unsaved">Unsaved</span>}
                      </th>
                      <td>
                        <label className="state-admin-status-control">
                          <span
                            className={`state-status-dot state-status-${status.toLowerCase()}`}
                            aria-hidden="true"
                          />
                          <span className="sr-only">{state.stateName} company status</span>
                          <select
                            className="admin-table-input"
                            value={status}
                            aria-describedby="state-availability-help"
                            onChange={(event) => setDraft((current) => ({
                              ...current,
                              [state.stateCode]: event.target.value as StateAvailabilityStatus,
                            }))}
                          >
                            {STATE_AVAILABILITY_STATUSES.map((option) => (
                              <option value={option} key={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                        <span className="state-admin-status-description">
                          {STATE_AVAILABILITY_META[status].description}
                        </span>
                      </td>
                      <td>
                        {state.updatedAt
                          ? new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(state.updatedAt))
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
