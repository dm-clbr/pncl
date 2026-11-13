import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSignature, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import Pane from "@/components/portal/Pane";
import DocumentRequestSigningPanel from "@/components/DocumentRequestSigningPanel";
import EmptyState from "@/components/portal/EmptyState";
import { listAgentDocumentRequests, type AgentDocumentRequest } from "@/lib/document-requests";
import "@/styles/portal-comp.css";
import "@/styles/document-requests.css";

export default function PortalDocuments() {
  const { session } = useAuth(); const token = session?.access_token ?? "";
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<AgentDocumentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const requestedId = params.get("request");
  const active = requestedId ? rows.find(row => row.id === requestedId) : rows.find(row => !row.signedAt) ?? rows[0];
  const reload = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError("");
    try { setRows(await listAgentDocumentRequests(token)); } catch (err) { setError(err instanceof Error ? err.message : "Unable to load documents."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { document.title = "Document requests — PNCL Portal"; void reload(); }, [reload]);
  return <PortalToolLayout title="Document requests" backTo="/portal/profile?tab=documents" backLabel="Back to documents" className="pcomp-page">
    <div className="ptools-stack">
      {success && <Pane><p role="status">{success}</p></Pane>}
      {error && <Pane><p className="ptools-error" role="alert">{error}</p><button className="ptools-cta" disabled={busy} onClick={() => void reload()}>Reload documents</button></Pane>}
      {loading ? <Pane><p role="status">Loading your document requests…</p></Pane> : <>
        {rows.length === 0 && !error ? <Pane><EmptyState title="No document requests" body="Documents PNCL asks you to sign will appear here, along with your signed copies." /></Pane> : rows.length > 0 && <Pane title="Your documents">
          <div className="document-agent-list">{rows.map(row => <button key={row.id} className={`document-agent-choice${active?.id === row.id ? " active" : ""}`} aria-pressed={active?.id === row.id} disabled={busy} onClick={() => { setParams({ request: row.id }); setSuccess(""); setError(""); }}>
            {row.signedAt ? <CheckCircle2 size={19} /> : <FileSignature size={19} />}<span>{row.title}<small>{row.signedAt ? `Signed ${new Date(row.signedAt).toLocaleDateString()}` : "Signature needed"}</small></span>
          </button>)}</div>
        </Pane>}
        {requestedId && !active && !error && <Pane><p role="alert">This request is not available for your account. Choose a document above.</p></Pane>}
        {active && <DocumentRequestSigningPanel key={active.id} request={active} token={token} onBusyChange={setBusy} onSigned={async () => {
          setParams({ request: active.id }, { replace: true });
          setSuccess("Document signed. Your signed copy is available below.");
          await reload();
        }} />}
      </>}
    </div>
  </PortalToolLayout>;
}
