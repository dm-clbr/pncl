import { useCallback, useEffect, useState } from "react";
import { FileText, Upload, Video } from "lucide-react";
import { fetchAdminOnboardingContent, uploadOnboardingContent, validateOnboardingAsset, type OnboardingAsset, type OnboardingAssetKind, type OnboardingFlowContent } from "@/lib/onboarding-content";
import type { AgentDesignation } from "@/lib/agent-designation";
import type { AdminPortalTodoSummary } from "@/lib/admin-api";
import { toast } from "sonner";

const SLOTS = [
  { kind: "ica", key: "ica", label: "Independent Contractor Agreement", shortLabel: "ICA", Icon: FileText },
  { kind: "welcome_video", key: "welcomeVideo", label: "Welcome & training video", shortLabel: "welcome video", Icon: Video },
  { kind: "surelc_video", key: "surelcVideo", label: "SureLC walkthrough", shortLabel: "SureLC video", Icon: Video },
] as const;

function AssetUpload({ designation, slot, asset, fallbackUrl, onUploaded, accessToken }: {
  designation: AgentDesignation; slot: typeof SLOTS[number]; asset: OnboardingAsset | null;
  fallbackUrl?: string; accessToken: string; onUploaded: (flow: OnboardingFlowContent) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = `${designation}-${slot.kind}-file`;
  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      validateOnboardingAsset(designation, slot.kind, file);
      const flow = await uploadOnboardingContent(accessToken, designation, slot.kind as OnboardingAssetKind, file);
      onUploaded(flow); setFile(null);
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      if (input) input.value = "";
      toast.success(`${designation.toUpperCase()} ${slot.shortLabel} saved.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed. Please retry."); }
    finally { setBusy(false); }
  };
  return <div className="admin-content-slot">
    <div className="admin-content-slot-title"><slot.Icon size={17} aria-hidden="true" /><h3>{slot.label}</h3></div>
    <p className="admin-content-filename">{asset?.filename ?? (slot.kind === "ica" ? "Standard PNCL ICA" : slot.kind === "surelc_video" ? "Current SureLC video" : "No welcome video uploaded")}</p>
    {(asset?.url || fallbackUrl) && <a className="admin-secondary-link" href={asset?.url || fallbackUrl} target="_blank" rel="noopener noreferrer">Preview {designation.toUpperCase()} {slot.shortLabel}</a>}
    <label className="admin-field" htmlFor={inputId}><span>Choose {designation.toUpperCase()} {slot.shortLabel}</span>
      <input id={inputId} type="file" accept={slot.kind === "ica" ? "application/pdf" : "video/mp4,video/webm"} disabled={busy}
        onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); }} />
    </label>
    <p className="admin-content-hint">{slot.kind === "ica" ? "PDF, up to 20 MB. Signed with an appended signature page." : "MP4 or WebM, up to 50 MB. Agents complete this step by watching the full video."}</p>
    <button type="button" className="admin-secondary-link admin-content-upload" disabled={!file || busy} onClick={() => void upload()}>
      <Upload size={15} aria-hidden="true" />{busy ? "Uploading…" : `Upload ${designation.toUpperCase()} ${slot.shortLabel}`}
    </button>
    {busy && <p role="status" className="admin-content-hint">Uploading and saving. Keep this page open.</p>}
    {error && <p role="alert" className="admin-error">{error}</p>}
  </div>;
}

export default function AdminOnboardingContent({ accessToken, todos, onSaved }: {
  accessToken?: string; todos: AdminPortalTodoSummary[]; onSaved: () => void;
}) {
  const [flows, setFlows] = useState<OnboardingFlowContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true); setError(null);
    try { setFlows(await fetchAdminOnboardingContent(accessToken)); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load onboarding content."); }
    finally { setLoading(false); }
  }, [accessToken]);
  useEffect(() => { void reload(); }, [reload]);
  const saved = (flow: OnboardingFlowContent) => {
    setFlows((current) => current.map((item) => item.designation === flow.designation ? flow : item));
    onSaved();
  };
  return <section className="admin-onboarding-content" aria-labelledby="flow-content-heading">
    <div className="admin-content-heading"><div><h2 id="flow-content-heading">Content for each flow</h2>
      <p>Choose the agreement and videos agents receive as LOA or IBO.</p></div><span className="admin-content-badge">Saved per upload</span></div>
    <p className="admin-panel-note">ICA uploads apply to future signatures. Existing signed agreements stay on file. Video uploads publish the matching checklist step for that flow.</p>
    {loading && <p role="status">Loading flow content…</p>}
    {error && <div role="alert" className="admin-error">{error} <button className="admin-secondary-link" onClick={() => void reload()}>Retry content loading</button></div>}
    {!loading && !error && <div className="admin-content-flows">{flows.map((flow) => <article className="admin-content-flow" key={flow.designation}>
      <div className="admin-content-flow-head"><h2>{flow.designation.toUpperCase()}</h2><span>Onboarding content</span></div>
      {SLOTS.map((slot) => <AssetUpload key={slot.kind} designation={flow.designation} slot={slot} asset={flow[slot.key]} accessToken={accessToken!} onUploaded={saved}
        fallbackUrl={slot.kind === "ica" ? "/documents/pncl-ica-standard.pdf" : slot.kind === "surelc_video" ? todos.find((todo) => todo.slug === (flow.designation === "ibo" ? "surelc_tutorial_ibo" : "surelc_tutorial"))?.href : undefined} />)}
    </article>)}</div>}
  </section>;
}
