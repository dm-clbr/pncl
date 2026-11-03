import { useState } from "react";
import { Link } from "react-router-dom";
import { FileSignature, Plus } from "lucide-react";
import { useOnboardingEditor } from "@/hooks/useOnboardingEditor";
import { blankEditorRow, STAGES, type EditorRow } from "@/lib/onboarding-editor";
import { documentLibraryEntries, documentRolloutUrl } from "@/lib/document-library";
import OnboardingStepModal from "./OnboardingStepModal";

export default function DocumentLibrary({ onHistory }: { onHistory: (stepId?: string) => void }) {
  const { data, loading, error, token, reload } = useOnboardingEditor();
  const [editing, setEditing] = useState<{ row: EditorRow; fields?: "loa" | "ibo" } | null>(null);
  const [search, setSearch] = useState("");
  const [flow, setFlow] = useState("all");
  const entries = documentLibraryEntries(data?.rows ?? []).filter(entry =>
    (flow === "all" || flow === entry.flow) && `${entry.row.title} ${entry.media?.filename ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="document-section-heading"><div><h2>Onboarding documents</h2><p>Each document belongs to an onboarding step. Edit its fields here or open the step to replace the PDF.</p></div>
      <button className="admin-primary-btn" disabled={!data} onClick={() => setEditing({ row: { ...blankEditorRow(), contentType: "signing_document" } })}><Plus size={17} />Add signing step</button>
    </div>
    {data?.signingRollout && !data.signingRollout.enabled && <p className="document-notice">Preparation mode: agents still use the previous signing process. Configure and test PDFs, then activate uploaded signing at the top of Onboarding steps. A signature rollout to existing agents is a separate, explicit send.</p>}
    <div className="document-filter-grid"><label className="admin-field"><span>Find a document</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Step or filename" /></label>
      <label className="admin-field"><span>Document flow</span><select value={flow} onChange={event => setFlow(event.target.value)}><option value="all">LOA + IBO</option><option value="loa">LOA</option><option value="ibo">IBO</option></select></label></div>
    {error && <p role="alert" className="admin-error">{error}</p>}
    {loading ? <p role="status">Loading onboarding documents…</p> : <div className="admin-table-wrap"><table className="admin-table document-library-table"><thead><tr><th>Document / onboarding step</th><th>Flow</th><th>Onboarding</th><th>Manage</th></tr></thead><tbody>
      {entries.map(({ row, flow: designation, media, signing, visible }) => <tr key={`${row.id}-${designation}`}>
        <td><strong>{row.title}</strong><small>{media?.filename ?? "PDF not uploaded"}</small><small>{STAGES.find(stage => stage.id === row.phase)?.label} · {signing ? "Signature required" : "Reference document"}</small></td>
        <td>{designation.toUpperCase()}</td><td>{!media ? "Needs PDF" : !row.published ? "Draft" : !visible ? "Hidden" : "Selected"}</td>
        <td><div className="document-actions">
          {media?.url && <a className="admin-secondary-link" href={media.url} target="_blank" rel="noopener noreferrer">{signing ? "View PDF" : "View document"}</a>}
          {media?.url && signing && <button className="admin-secondary-btn" onClick={() => setEditing({ row, fields: designation })} aria-label={`Edit fields for ${row.title} ${designation.toUpperCase()}`}>Edit fields</button>}
          <button className="admin-secondary-btn" onClick={() => setEditing({ row })} aria-label={`Edit step for ${row.title} ${designation.toUpperCase()}`}>{media ? "Edit step / replace PDF" : "Set up PDF"}</button>
          {signing && media?.assetId && row.published && visible && <Link className="admin-secondary-link" to={documentRolloutUrl(row.id, designation, media.assetId)}>Request signatures</Link>}
          {signing && <button className="admin-secondary-btn" onClick={() => onHistory(row.id)}>Rollout history</button>}
        </div></td>
      </tr>)}
    </tbody></table>{!entries.length && <p className="document-empty"><FileSignature size={26} />No documents match these filters.</p>}</div>}
    <button className="admin-secondary-btn" onClick={() => onHistory()}>All rollout history</button>
    {editing && data && <OnboardingStepModal row={editing.row} initialFieldFlow={editing.fields} token={token} limits={data.limits} supportingFilesEnabled={data.features?.supportingFiles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
  </>;
}
