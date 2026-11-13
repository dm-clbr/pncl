import { useState } from "react";
import { FileCheck2 } from "lucide-react";
import Pane from "./Pane";
import AgreementPdfPreview from "./AgreementPdfPreview";
import ListRow from "./ListRow";
import DocumentRequestSigningPanel from "@/components/DocumentRequestSigningPanel";
import { agentDocumentUrl, type AgentDocumentRequest } from "@/lib/document-requests";
import type { OnboardingAsset } from "@/lib/onboarding-content";
import { toast } from "sonner";
import "@/styles/portal-tools.css";

export default function IcaDocumentRequests({ token, rows, loading, error, reload, initialName, previewAsset }: {
  token: string; rows: AgentDocumentRequest[]; loading: boolean; error: string;
  reload: () => Promise<unknown>; initialName: string; previewAsset?: OnboardingAsset | null;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState(false);
  const pending = rows.filter(row => !row.signedAt);
  const active = pending.find(row => row.id === selectedId) ?? pending[0];
  const signedCopies = rows.filter(row => row.signedAt);
  const [openingId, setOpeningId] = useState("");
  async function openSigned(row: AgentDocumentRequest) {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setOpeningId(row.id);
    try {
      const url = await agentDocumentUrl(token, row.id);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    }
    catch (error) { tab?.close(); toast.error(error instanceof Error ? error.message : "Unable to open signed agreement."); }
    finally { setOpeningId(""); }
  }
  return <div className="ica-agreement-stack pcomp-page ptools-page">
    {signed && <Pane><p role="status">Your new ICA is signed. Your signed agreements remain available on this page.</p></Pane>}
    {loading && <Pane><p role="status">Checking for a new ICA…</p></Pane>}
    {error && <Pane><p role="alert">{error}</p><button className="ptools-cta" onClick={() => void reload()}>Retry new agreement</button></Pane>}
    {!loading && !error && active && <>
      {pending.length > 1 && <label className="onboarding-field">Agreement to sign<select value={active.id} disabled={busy} onChange={event => setSelectedId(event.target.value)}>{pending.map(row => <option key={row.id} value={row.id}>{row.title} · requested {new Date(row.assignedAt).toLocaleDateString()}</option>)}</select></label>}
      <DocumentRequestSigningPanel key={active.id} request={active} token={token} initialName={initialName}
        heading="New ICA — review and sign" intro="Your previous signed agreement stays on file. Review the new agreement below and adopt your signature to sign this edition."
        onBusyChange={setBusy} onSigned={async () => { setSigned(true); await reload(); }} />
    </>}
    {!loading && !error && signedCopies.length > 0 && <Pane title="Signed ICA editions">
      {signedCopies.map(row => <ListRow key={row.id} label={openingId === row.id ? "Opening signed ICA…" : row.title}
        secondary={`Signed ${new Date(row.signedAt!).toLocaleDateString()} by ${row.signatureName}`}
        icon={<FileCheck2 size={18} />} onClick={() => { if (!openingId) void openSigned(row); }} />)}
    </Pane>}
    {!loading && !error && !active && previewAsset && !rows.some(row => row.templateAssetId === previewAsset.id) && <Pane title="New ICA — admin preview">
      <p className="portal-panel-note">This is the current uploaded agreement. Your admin account has no signature request for this edition. Agents with a request can review and sign it here.</p>
      <AgreementPdfPreview title="New ICA preview" url={previewAsset.url} />
      <ListRow label="Open new ICA PDF" href={previewAsset.url} />
    </Pane>}
  </div>;
}
