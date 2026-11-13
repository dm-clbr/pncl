import SignatureAdoptionDialog from "@/components/SignatureAdoptionDialog";
import SigningDocumentReview from "@/components/SigningDocumentReview";
import { useEffect, useState, type FormEvent } from "react";
import { FileSignature, ArrowUpRight } from "lucide-react";
import Pane from "@/components/portal/Pane";
import Field from "@/components/portal/Field";
import { DOCUMENT_CONSENT, agentDocumentUrl, signAgentDocument, validateDocumentSignature, type AgentDocumentRequest } from "@/lib/document-requests";
import type { AdoptedSignature } from "../../supabase/functions/_shared/signatureAdoption";
import "@/styles/signature-adoption.css";
import "@/styles/portal-comp.css";
import "@/styles/document-requests.css";

export default function DocumentRequestSigningPanel({ request: active, token, onSigned, onBusyChange, initialName = "", heading, intro }: {
  request: AgentDocumentRequest; token: string; onSigned: () => Promise<unknown>;
  initialName?: string; heading?: string; intro?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const activeId = active.id;
  const activeSignedAt = active.signedAt;
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
  useEffect(() => {
    setSignature(initialName); setSignatureEditorOpen(false); setAdoptedSignature(null); setAccepted(false); setReviewed(false); setFieldValues({}); setUrl(""); setUrlError("");
    if (!activeId || !token) return;
    let cancelled = false; setUrlLoading(true);
    void agentDocumentUrl(token, activeId).then(value => { if (!cancelled) setUrl(value); })
      .catch(err => { if (!cancelled) setUrlError(err instanceof Error ? err.message : "Unable to open document."); })
      .finally(() => { if (!cancelled) setUrlLoading(false); });
    return () => { cancelled = true; };
  }, [token, activeId, activeSignedAt, urlRevision, initialName]);
  const sign = async (event: FormEvent) => {
    event.preventDefault();
    if (!active || !url || busy || !reviewed || !adoptedSignature) return;
    setError("");
    try {
      const name = validateDocumentSignature(signature, accepted);
      setBusy(true);
      onBusyChange?.(true);
      await signAgentDocument(token, active.id, name, accepted, active.documentHash, fieldValues, adoptedSignature);
      await onSigned();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to sign. Please retry."); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  return <Pane title={heading ?? active.title}>
          {intro && <p className="portal-panel-note">{intro}</p>}
          {error && <p className="ptools-error" role="alert">{error}</p>}
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
        </Pane>;
}
