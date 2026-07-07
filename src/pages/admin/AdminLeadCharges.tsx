import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, FileUp, Receipt } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  listLeadCharges,
  uploadLeadCharges,
  type AdminLeadCharge,
  type AdminLeadChargeUploadRow,
} from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

/** Minimal CSV parser with quoted-field support. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) =>
    candidates.some((candidate) => header.toLowerCase().includes(candidate)),
  );
}

function parseAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Maps a LeadSpply CSV export to upload rows; returns null when no usable columns. */
function csvToUploadRows(rows: string[][]): AdminLeadChargeUploadRow[] | null {
  if (rows.length < 2) return null;
  const headers = rows[0].map((header) => header.trim());

  const emailIdx = findColumn(headers, ["email"]);
  const nameIdx = findColumn(headers, ["name", "agent", "rep"]);
  const amountIdx = findColumn(headers, ["amount", "cost", "charge", "total", "price", "spend"]);
  const agentNumberIdx = findColumn(headers, ["agent id", "agent #", "pncl"]);
  const descriptionIdx = findColumn(headers, ["description", "product", "lead type", "campaign", "notes"]);

  if (amountIdx === -1 || (emailIdx === -1 && nameIdx === -1 && agentNumberIdx === -1)) {
    return null;
  }

  const parsed: AdminLeadChargeUploadRow[] = [];
  for (const row of rows.slice(1)) {
    const amountCents = parseAmountCents(row[amountIdx] ?? "");
    if (amountCents === null) continue;

    const agentNumberRaw = agentNumberIdx >= 0 ? (row[agentNumberIdx] ?? "").replace(/\D/g, "") : "";
    parsed.push({
      email: emailIdx >= 0 ? row[emailIdx]?.trim() || undefined : undefined,
      name: nameIdx >= 0 ? row[nameIdx]?.trim() || undefined : undefined,
      agentNumber: agentNumberRaw ? Number(agentNumberRaw) : undefined,
      description: descriptionIdx >= 0 ? row[descriptionIdx]?.trim() || undefined : undefined,
      amountCents,
    });
  }

  return parsed.length > 0 ? parsed : null;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

interface RepSummary {
  key: string;
  name: string;
  email: string | null;
  matched: boolean;
  totalCents: number;
  count: number;
}

function summarizeByRep(charges: AdminLeadCharge[]): RepSummary[] {
  const byKey = new Map<string, RepSummary>();
  for (const charge of charges) {
    const key = charge.userId ?? `unmatched:${charge.agentEmail ?? charge.agentName ?? "unknown"}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.totalCents += charge.amountCents;
      existing.count += 1;
    } else {
      byKey.set(key, {
        key,
        name: charge.portalName ?? charge.agentName ?? charge.agentEmail ?? "Unknown",
        email: charge.portalEmail ?? charge.agentEmail,
        matched: Boolean(charge.userId),
        totalCents: charge.amountCents,
        count: 1,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.totalCents - a.totalCents);
}

export default function AdminLeadCharges() {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [charges, setCharges] = useState<AdminLeadCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadWeek, setUploadWeek] = useState("");
  const [pendingRows, setPendingRows] = useState<AdminLeadChargeUploadRow[] | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    document.title = "Lead charges — PNCL Admin";
    trackPageView("admin_lead_charges");
  }, []);

  const reload = useCallback(async (weekOf?: string) => {
    const token = session?.access_token;
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const data = await listLeadCharges(token, weekOf);
      setWeeks(data.weeks);
      setSelectedWeek(data.weekOf ?? "");
      setCharges(data.charges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load lead charges");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const rows = csvToUploadRows(parseCsv(text));
      if (!rows) {
        toast.error(
          "Couldn't read that CSV. It needs an amount column plus an email, name, or agent ID column.",
        );
        return;
      }
      setPendingRows(rows);
      setPendingFileName(file.name);
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    const token = session?.access_token;
    if (!token || !pendingRows || !uploadWeek) return;

    setUploading(true);
    try {
      const result = await uploadLeadCharges(token, {
        weekOf: uploadWeek,
        sourceFile: pendingFileName,
        rows: pendingRows,
      });
      toast.success(result.message);
      setPendingRows(null);
      setPendingFileName(null);
      await reload(uploadWeek);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to upload lead charges");
    } finally {
      setUploading(false);
    }
  };

  const repSummaries = useMemo(() => summarizeByRep(charges), [charges]);
  const totalCents = useMemo(
    () => charges.reduce((sum, charge) => sum + charge.amountCents, 0),
    [charges],
  );
  const unmatchedCount = useMemo(
    () => charges.filter((charge) => !charge.userId).length,
    [charges],
  );

  const handleDownloadReport = () => {
    if (repSummaries.length === 0) return;

    const escape = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const lines = [
      ["Agent", "Email", "Matched", "Charges", "Total"].join(","),
      ...repSummaries.map((rep) => [
        escape(rep.name),
        escape(rep.email ?? ""),
        rep.matched ? "Yes" : "No",
        String(rep.count),
        (rep.totalCents / 100).toFixed(2),
      ].join(",")),
    ];

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lead-charges-${selectedWeek}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <Receipt size={22} aria-hidden="true" />
        <div>
          <h1>LeadSpply charges</h1>
          <p>
            Upload the weekly LeadSpply cost CSV. Rows are matched to agents by email or agent ID,
            and the per-rep report below is ready for Monday payroll deductions.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <label className="admin-field">
          <span>Week of</span>
          <input
            type="date"
            value={uploadWeek}
            onChange={(event) => setUploadWeek(event.target.value)}
          />
        </label>

        <div className="admin-field">
          <span>LeadSpply CSV</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="portal-profile-photo-input"
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="admin-secondary-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={14} aria-hidden="true" />
            {pendingFileName ? pendingFileName : "Choose CSV"}
          </button>
        </div>

        <button
          type="button"
          className="admin-primary-btn"
          disabled={uploading || !pendingRows || !uploadWeek}
          onClick={() => void handleUpload()}
        >
          {uploading
            ? "Uploading…"
            : pendingRows
              ? `Upload ${pendingRows.length} rows`
              : "Upload charges"}
        </button>
      </div>

      {pendingRows && !uploadWeek && (
        <p className="admin-error">Pick the week these charges apply to before uploading.</p>
      )}

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading charges" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && weeks.length === 0 && (
        <p className="admin-empty">No lead charges uploaded yet. Upload your first weekly CSV above.</p>
      )}

      {!loading && !error && weeks.length > 0 && (
        <>
          <div className="admin-toolbar">
            <label className="admin-field">
              <span>Report week</span>
              <select
                value={selectedWeek}
                onChange={(event) => void reload(event.target.value)}
              >
                {weeks.map((week) => (
                  <option key={week} value={week}>
                    Week of {week}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="admin-secondary-btn"
              disabled={repSummaries.length === 0}
              onClick={handleDownloadReport}
            >
              <Download size={14} aria-hidden="true" />
              Download per-rep report
            </button>
          </div>

          <div className="admin-stats">
            <div className="admin-stat">
              <strong>{formatCents(totalCents)}</strong>
              <span>Total charges</span>
            </div>
            <div className="admin-stat">
              <strong>{repSummaries.length}</strong>
              <span>Reps charged</span>
            </div>
            <div className="admin-stat">
              <strong>{unmatchedCount}</strong>
              <span>Unmatched rows</span>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Email</th>
                  <th>Matched</th>
                  <th>Charges</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {repSummaries.map((rep) => (
                  <tr key={rep.key}>
                    <td>{rep.name}</td>
                    <td>{rep.email ?? "—"}</td>
                    <td>
                      <span className={`admin-status${rep.matched ? " active" : " error"}`}>
                        {rep.matched ? "Matched" : "Unmatched"}
                      </span>
                    </td>
                    <td>{rep.count}</td>
                    <td>{formatCents(rep.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
