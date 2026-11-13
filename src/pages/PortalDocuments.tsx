import SignatureAdoptionDialog from "@/components/SignatureAdoptionDialog";
import "@/styles/signature-adoption.css";
import type { AdoptedSignature } from "../../supabase/functions/_shared/signatureAdoption";
import SigningDocumentReview from "@/components/SigningDocumentReview";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSignature, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import Pane from "@/components/portal/Pane";
import Field from "@/components/portal/Field";
import EmptyState from "@/components/portal/EmptyState";
import { DOCUMENT_CONSENT, agentDocumentUrl, listAgentDocumentRequests, signAgentDocument, validateDocumentSignature, type AgentDocumentRequest } from "@/lib/document-requests";
import "@/styles/portal-comp.css";
import "@/styles/document-requests.css";

export default function PortalDocuments() {
  const { session } = useAuth(); const token = session?.access_token ?? "";
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<AgentDocumentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlRevision, setUrlRevision] = useState(0);
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [reviewed, setReviewed] = useState(false);
  const [signature, setSignature] = useState("");
  const [adoptedSignature, setAdoptedSignature] = useState<AdoptedSignature | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [signatureEditorOpen, setSignatureEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const requestedId = params.get("request");
  const active = requestedId ? rows.find(row => row.id === requestedId) : rows.find(row => !row.signedAt) ?? rows[0];
  const activeId = active?.id;
  const activeSignedAt = active?.signedAt;
  const reload = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError("");
    try { setRows(await listAgentDocumentRequests(token)); } catch (err) { setError(err instanceof Error ? err.message : "Unable to load documents."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { document.title = "Document requests — PNCL Portal"; void reload(); }, [reload]);
  useEffect(() => {
    setSignature(""); setSignatureEditorOpen(false); setAdoptedSignature(null); setAccepted(false); setReviewed(false); setFieldValues({}); setUrl(""); setUrlError("");
    if (!activeId || !token) return;
    let cancelled = false; setUrlLoading(true);
    void agentDocumentUrl(token, activeId).then(value => { if (!cancelled) setUrl(value); })
      .catch(err => { if (!cancelled) setUrlError(err instanceof Error ? err.message : "Unable to open document."); })
      .finally(() => { if (!cancelled) setUrlLoading(false); });
    return () => { cancelled = true; };
  }, [token, activeId, activeSignedAt, urlRevision]);
  const sign = async (event: FormEvent) => {
    event.preventDefault();
    if (!active || !url || busy || !reviewed || !adoptedSignature) return;
    setError(""); setSuccess("");
    try {
      const name = validateDocumentSignature(signature, accepted);
      setBusy(true);
      await signAgentDocument(token, active.id, name, accepted, active.documentHash, fieldValues, adoptedSignature);
      setParams({ request: active.id }, { replace: true });
      setSuccess("Document signed. Your signed copy is available below.");
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to sign. Please retry."); }
    finally { setBusy(false); }
  };
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
        {active && <Pane title={active.title}>
          {active.description && <p className="portal-panel-note">{active.description}</p>}
          {active.signedAt && <p className="portal-panel-note">Signed by {active.signatureName} on {new Date(active.signedAt).toLocaleString()}.</p>}
          {urlLoading && <p role="status">Opening document…</p>}
          {urlError && <div><p role="alert" className="ptools-error">{urlError}</p><button className="ptools-cta" onClick={() => setUrlRevision(value => value + 1)}>Retry opening document</button></div>}
          {url && <>
            <div className="document-actions">
            <a className="ptools-cta" href={url} target="_blank" rel="noopener noreferrer">{active.signedAt ? "Open or download signed PDF" : "Open full PDF"}<ArrowUpRight size={16} /></a>
            <button className="ptools-cta" type="button" disabled={busy} onClick={() => setUrlRevision(value => value + 1)}>Refresh document link</button>
            </div>
            {active.signedAt ? <iframe title={`${active.title} signed copy`} className="portal-comp-signing-pdf document-agent-pdf" src={url} /> : <SigningDocumentReview key={active.id} url={url} title={active.title} onReviewed={setReviewed} values={fieldValues} onValuesChange={setFieldValues} signingName={signature} signatureImage={adoptedSignature?.imageDataUrl} onSignatureClick={busy ? undefined : () => setSignatureEditorOpen(true)} />}
          </>}
          {!active.signedAt && <form className="pcomp-form" onSubmit={event => void sign(event)}>
            <Field id="document-signature" label="Full legal first and last name" hint="Use your full name, not initials or a line signature." value={signature} maxLength={120} autoComplete="name" required disabled={busy || !url} onChange={e => { setSignature(e.target.value); setAdoptedSignature(null); }} />
            <div className="adopted-signature-summary">{adoptedSignature && <img src={adoptedSignature.imageDataUrl} alt="Adopted signature" />}<button type="button" className="ptools-cta" disabled={busy || !url} onClick={() => setSignatureEditorOpen(true)}>{adoptedSignature ? "Change signature" : "Create signature"}</button></div>
            {signatureEditorOpen && <SignatureAdoptionDialog name={signature} onNameChange={name => { setSignature(name); setAdoptedSignature(null); }} onAdopt={value => { setAdoptedSignature(value); setSignatureEditorOpen(false); }} onClose={() => setSignatureEditorOpen(false)} />}
            <label className="pcomp-agree"><input type="checkbox" checked={accepted} required disabled={busy || !url} onChange={e => setAccepted(e.target.checked)} /><span>{DOCUMENT_CONSENT}</span></label>
            <button className="ptools-cta" type="submit" disabled={busy || !url || !reviewed || !accepted || !adoptedSignature || !signature.trim()}><FileSignature size={17} />{busy ? "Signing…" : "Sign document"}</button>
          </form>}
        </Pane>}
      </>}
    </div>
  </PortalToolLayout>;
}
