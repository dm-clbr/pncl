import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, FileSignature, RotateCcw, X } from "lucide-react";
import AdminCompAttachmentPanel from "@/components/admin/AdminCompAttachmentPanel";
import { useAuth } from "@/contexts/AuthContext";
import {
  listContractingQueue,
  markContractingInitiated,
  type AdminContractingRow,
} from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

type ContractingFilter =
  | "ready"
  | "initiated"
  | "ica_comp_needed"
  | "comp_pending"
  | "comp_signed";

const FILTER_LABELS: Record<ContractingFilter, string> = {
  ready: "Ready for contracting",
  initiated: "Contracting initiated",
  ica_comp_needed: "ICA signed — comp needed",
  comp_pending: "Comp pending signature",
  comp_signed: "Comp signed",
};

function matchesFilter(row: AdminContractingRow, filter: ContractingFilter): boolean {
  switch (filter) {
    case "ready":
      return row.licensingReady && !row.contractingInitiatedAt;
    case "initiated":
      return Boolean(row.contractingInitiatedAt);
    case "ica_comp_needed":
      return row.icaSigned && row.compStatus === "none";
    case "comp_pending":
      return row.compStatus === "pending";
    case "comp_signed":
      return row.compStatus === "signed";
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CompAttachmentModal({
  row,
  accessToken,
  onClose,
  onChanged,
}: {
  row: AdminContractingRow;
  accessToken: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-modal"
        role="dialog"
        aria-labelledby="admin-comp-attachment-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <h2 id="admin-comp-attachment-title">Comp attachments</h2>
            <p>Upload the Kam-signed PDF for {row.name}. The agent signs at /portal/comp-agreement.</p>
          </div>
          <button type="button" className="admin-modal-close" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <AdminCompAttachmentPanel
          userId={row.userId}
          userName={row.name}
          accessToken={accessToken}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}

export default function AdminContracting() {
  const { session } = useAuth();
  const [rows, setRows] = useState<AdminContractingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ContractingFilter>("ready");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [compRow, setCompRow] = useState<AdminContractingRow | null>(null);

  const accessToken = session?.access_token ?? "";

  const reload = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await listContractingQueue(accessToken);
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load contracting queue");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    document.title = "Contracting — PNCL Admin";
    trackPageView("admin_contracting");
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const counts = useMemo(() => {
    const result = {} as Record<ContractingFilter, number>;
    for (const key of Object.keys(FILTER_LABELS) as ContractingFilter[]) {
      result[key] = rows.filter((row) => matchesFilter(row, key)).length;
    }
    return result;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows
      .filter((row) => matchesFilter(row, filter))
      .filter((row) =>
        !normalized
          ? true
          : row.name.toLowerCase().includes(normalized) ||
            row.email.toLowerCase().includes(normalized) ||
            (row.npn ?? "").toLowerCase().includes(normalized),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, filter, query]);

  const handleMarkInitiated = async (row: AdminContractingRow, initiated: boolean) => {
    if (!accessToken) return;

    const confirmMessage = initiated
      ? `Mark contracting as initiated for ${row.name}?`
      : `Clear contracting initiation for ${row.name}?`;
    if (!window.confirm(confirmMessage)) return;

    setMarkingId(row.userId);
    try {
      const result = await markContractingInitiated(accessToken, {
        userId: row.userId,
        initiated,
      });
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update contracting status");
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <FileSignature size={22} aria-hidden="true" />
        <div>
          <h1>Contracting</h1>
          <p>
            Agents ready for carrier contracting (NPN + E&amp;O on file), signed ICAs awaiting comp
            attachments, and comp signature status.
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
            placeholder="Name, email, or NPN"
          />
        </label>

        <label className="admin-field">
          <span>Queue</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as ContractingFilter)}
          >
            {(Object.keys(FILTER_LABELS) as ContractingFilter[]).map((key) => (
              <option key={key} value={key}>
                {FILTER_LABELS[key]} ({counts[key] ?? 0})
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading queue" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>NPN</th>
                <th>E&amp;O</th>
                <th>ICA</th>
                <th>Comp attachment</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isMarking = markingId === row.userId;
                return (
                  <tr key={row.userId}>
                    <td>
                      <Link to={`/portal/admin/users/${row.userId}`} className="admin-secondary-link">
                        {row.name}
                      </Link>
                      <div className="admin-inline-note muted">{row.email}</div>
                    </td>
                    <td>{row.npn ?? "—"}</td>
                    <td>
                      {row.eoPolicyNumber ? (
                        <>
                          {row.eoPolicyNumber}
                          <div className="admin-inline-note muted">
                            {row.hasEoCertificate ? "Certificate uploaded" : "No certificate"}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {row.icaSigned ? (
                        <span className="admin-status active">
                          Signed{row.icaSignedAt ? ` ${formatDate(row.icaSignedAt)}` : ""}
                        </span>
                      ) : (
                        <span className="admin-status pending">Not signed</span>
                      )}
                    </td>
                    <td>
                      {row.compStatus === "signed" ? (
                        <span className="admin-status active">
                          Signed {formatDate(row.compSignedAt)}
                        </span>
                      ) : row.compStatus === "pending" ? (
                        <span className="admin-status pending">
                          Awaiting signature (assigned {formatDate(row.compAssignedAt)})
                        </span>
                      ) : (
                        <span className="admin-status skipped">Not assigned</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        {row.contractingInitiatedAt ? (
                          <button
                            type="button"
                            className="admin-icon-btn"
                            disabled={isMarking}
                            onClick={() => void handleMarkInitiated(row, false)}
                            title={`Initiated ${formatDate(row.contractingInitiatedAt)} — click to undo`}
                          >
                            <RotateCcw size={16} aria-hidden="true" />
                            {isMarking ? "Saving…" : `Initiated ${formatDate(row.contractingInitiatedAt)}`}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-icon-btn"
                            disabled={isMarking || !row.licensingReady}
                            title={
                              row.licensingReady
                                ? "Mark carrier contracting as initiated"
                                : "Needs NPN and E&O policy number first"
                            }
                            onClick={() => void handleMarkInitiated(row, true)}
                          >
                            <Check size={16} aria-hidden="true" />
                            {isMarking ? "Saving…" : "Contracting initiated"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => setCompRow(row)}
                        >
                          <FileUp size={16} aria-hidden="true" />
                          Comp attachment
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredRows.length === 0 && <p className="admin-empty">No agents match this queue.</p>}
        </div>
      )}

      {compRow && accessToken && (
        <CompAttachmentModal
          row={compRow}
          accessToken={accessToken}
          onClose={() => setCompRow(null)}
          onChanged={() => void reload()}
        />
      )}
    </section>
  );
}
