import { useCallback, useEffect, useRef, useState } from "react";
import { FileSignature, Plus, ArrowLeft, Send, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import OnboardingAdminNav from "@/components/admin/OnboardingAdminNav";
import PdfFieldEditor from "@/components/admin/PdfFieldEditor";
import {
  EMPTY_DOCUMENT_FILTERS, MAX_DOCUMENT_BYTES, adminDocumentUrl, documentRequestReport,
  listDocumentCampaigns, notifyDocumentRecipients, previewDocumentRecipients, publishDocumentRequest,
  readDocumentFile, setDocumentOnboarding, releaseDocumentCurrentAgents, type DocumentAudience, type DocumentCampaign,
  type DocumentFilters, type DocumentDelivery, type DocumentRolloutOrder, type DocumentRecipient, type DocumentRecipientStatus,
} from "@/lib/document-requests";
import { US_STATE_CODES } from "@/lib/us-states";
import "@/styles/document-requests.css";

const audienceLabel = (value: DocumentAudience) => value === "all" ? "All agents (LOA + IBO)" : `${value.toUpperCase()} agents`;
const deliveryLabel = { email: "Email only", portal: "Notification action at next login", both: "Email + notification action at next login" };
const orderLabel = { together: "Both audiences together", current_first: "Current agents first → future onboarding later", onboarding_first: "Future onboarding first → current agents later" };
function AudienceOptions() { return <><option value="all">All agents (LOA + IBO)</option><option value="loa">LOA only</option><option value="ibo">IBO only</option></>; }
function message(error: unknown) { return error instanceof Error ? error.message : "Unable to save. Please retry."; }

function ComposeDocument({ token, onCancel, onPublished }: { token: string; onCancel: () => void; onPublished: (id: string, notify: boolean) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [editingFields, setEditingFields] = useState(false);
  const [filters, setFilters] = useState<DocumentFilters>({ ...EMPTY_DOCUMENT_FILTERS });
  const [existingAgents, setExistingAgents] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [onboardingAudience, setOnboardingAudience] = useState<DocumentAudience>("all");
  const [delivery, setDelivery] = useState<DocumentDelivery>("both");
  const [rolloutOrder, setRolloutOrder] = useState<DocumentRolloutOrder>("current_first");
  const effectiveOrder = existingAgents && onboarding ? rolloutOrder : "together";
  const [recipients, setRecipients] = useState<DocumentRecipient[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const id = useRef(crypto.randomUUID());
  const attempted = useRef(false);
  const locked = busy || attempted.current;
  useEffect(() => {
    if (!file) { setFileUrl(""); return; }
    const url = URL.createObjectURL(file); setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const changeFilters = (patch: Partial<DocumentFilters>) => { setFilters(prev => ({ ...prev, ...patch })); setRecipients(null); setReviewing(false); };
  const review = async () => {
    setError("");
    if (!title.trim() || !file) { setError("Add a title and PDF before reviewing recipients."); return; }
    if (!existingAgents && !onboarding) { setError("Choose existing agents, future onboarding, or both."); return; }
    setBusy(true);
    try {
      const rows = existingAgents ? await previewDocumentRecipients(token, filters) : [];
      setRecipients(rows); setSelected(new Set(rows.map(row => row.id))); setReviewing(true);
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };
  const publish = async () => {
    if (!file || !recipients || busy) return;
    setBusy(true); setError("");
    try {
      const pdfBase64 = await readDocumentFile(file);
      attempted.current = true;
      const result = await publishDocumentRequest(token, {
        id: id.current, title: title.trim(), description: description.trim(), pdfBase64, filters,
        recipientIds: [...selected], onboardingEnabled: onboarding, onboardingAudience, deliveryMode: delivery, rolloutOrder: effectiveOrder,
      });
      setPublishedId(result.id);
      await onPublished(result.id, delivery !== "portal" && selected.size > 0 && effectiveOrder !== "onboarding_first");
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };
  return <div className="document-compose">
    {editingFields && fileUrl && file && <PdfFieldEditor url={fileUrl} filename={file.name} onClose={() => setEditingFields(false)} onSave={async next => { if (next.size > MAX_DOCUMENT_BYTES) throw new Error("The edited PDF must be 10 MB or smaller."); setFile(next); setReviewing(false); }} />}
    <div className="document-section-heading"><h2>New document request</h2><button className="admin-secondary-btn" onClick={onCancel} disabled={busy}><ArrowLeft size={16} />Back to requests</button></div>
    <p>Upload a final PDF. Agents review the document and sign with their full legal name. A signed copy includes an electronic signature record.</p>
    {error && <p role="alert" className="admin-error">{error}{attempted.current && " Retry with the same request to avoid duplicates. If the audience changed, return to the requests list before starting again."}</p>}
    <fieldset disabled={locked} className="document-fields">
      <legend className="sr-only">Document and audience</legend>
      <section className="document-step"><h3><span>1</span> Document</h3>
        <label className="admin-field"><span>Document title</span><input value={title} maxLength={160} onChange={e => { setTitle(e.target.value); setReviewing(false); }} placeholder="e.g. Own your book addendum" /></label>
        <label className="admin-field"><span>Instructions for agents (optional)</span><textarea rows={3} value={description} maxLength={2000} onChange={e => { setDescription(e.target.value); setReviewing(false); }} placeholder="Explain what agents need to review." /></label>
        <label className="admin-field document-upload"><span>PDF document · up to 10 MB</span><input type="file" accept="application/pdf,.pdf" onChange={e => {
          const next = e.target.files?.[0] ?? null; setReviewing(false);
          if (next && (next.size > MAX_DOCUMENT_BYTES || !/\.pdf$/i.test(next.name))) { setError("Choose a PDF of 10 MB or smaller."); setFile(null); e.target.value = ""; return; }
          setFile(next); setError("");
        }} /></label>
        {fileUrl && <a className="admin-secondary-link" href={fileUrl} target="_blank" rel="noopener noreferrer">Preview {file?.name}</a>}
        {fileUrl && <button type="button" className="admin-secondary-btn" onClick={() => setEditingFields(true)}>Place input fields</button>}
      </section>
      <section className="document-step"><h3><span>2</span> Existing agents</h3>
        <label className="document-check"><input type="checkbox" checked={existingAgents} onChange={e => { setExistingAgents(e.target.checked); setRecipients(null); setReviewing(false); }} />Send to existing agents</label>
        {existingAgents && <>
          <p>Start with all agents or narrow the audience below. You can select individual agents in the review. Admin accounts and disabled portal accounts are excluded.</p>
          <div className="document-filter-grid">
            <label className="admin-field"><span>Agent type</span><select value={filters.designation} onChange={e => changeFilters({ designation: e.target.value as DocumentAudience })}><AudienceOptions /></select></label>
            <label className="admin-field"><span>ICA status</span><select value={filters.ica} onChange={e => changeFilters({ ica: e.target.value as DocumentFilters["ica"] })}><option value="all">Any ICA status</option><option value="signed">Signed ICA on file</option><option value="unsigned">No signed ICA on file</option></select></label>
            <label className="admin-field"><span>State of residence</span><select value={filters.state} onChange={e => changeFilters({ state: e.target.value })}><option value="">All states</option>{US_STATE_CODES.map(state => <option key={state} value={state}>{state}</option>)}</select></label>
            <label className="admin-field"><span>Name or email</span><input value={filters.search} maxLength={100} onChange={e => changeFilters({ search: e.target.value })} placeholder="Find specific agents" /></label>
            <label className="admin-field"><span>Joined on or after</span><input type="date" value={filters.joinedAfter} onChange={e => changeFilters({ joinedAfter: e.target.value })} /></label>
            <label className="admin-field"><span>Joined on or before</span><input type="date" value={filters.joinedBefore} onChange={e => changeFilters({ joinedBefore: e.target.value })} /></label>
          </div>
        </>}
      </section>
      <section className="document-step"><h3><span>3</span> Future onboarding</h3>
        <label className="document-check"><input type="checkbox" checked={onboarding} onChange={e => { setOnboarding(e.target.checked); setReviewing(false); }} />Require this document for future new agents</label>
        {onboarding && <>
          <label className="admin-field"><span>Add to onboarding for</span><select value={onboardingAudience} onChange={e => { setOnboardingAudience(e.target.value as DocumentAudience); setReviewing(false); }}><AudienceOptions /></select></label>
          <p>Agents whose accounts are created after the onboarding stage starts receive this required signing step when they first open the portal. This uses only the agent type above; existing-agent filters do not apply.</p>
        </>}
      </section>
      <section className="document-step"><h3><span>4</span> Rollout & delivery</h3>
        {existingAgents && onboarding && <>
          <label className="admin-field"><span>Rollout order</span><select value={rolloutOrder} onChange={e => { setRolloutOrder(e.target.value as DocumentRolloutOrder); setReviewing(false); }}>
            <option value="current_first">Current agents first</option>
            <option value="onboarding_first">Future onboarding first</option>
            <option value="together">Both audiences together</option>
          </select></label>
          <p>{rolloutOrder === "together" ? "Both audiences start when you publish this request." : rolloutOrder === "current_first" ? "Current agents receive the request first. Start the future onboarding stage from this request whenever you are ready." : "Future onboarding starts first. The selected current agents receive nothing until you start their stage from this request."} {rolloutOrder !== "together" && "The second stage does not start automatically."}</p>
        </>}
        <label className="admin-field"><span>Delivery method</span><select value={delivery} onChange={e => { setDelivery(e.target.value as DocumentDelivery); setReviewing(false); }}>
          <option value="both">Email + next-login action</option><option value="email">Email only</option><option value="portal">Next-login action only</option>
        </select></label>
        <p>{delivery === "email" ? "Agents receive an email link to review and sign." : delivery === "portal" ? "Agents see a review-and-sign action when they next open their portal." : "Agents receive an email link and see a review-and-sign action when they next open their portal."} Every released request remains available in Documents and the checklist. Future-agent emails are sent when their onboarding request is assigned on their first portal visit.</p>
      </section>
    </fieldset>
    {!reviewing ? <button className="admin-primary-btn" disabled={busy} onClick={() => void review()}>{busy ? "Loading recipients…" : "Review request"}</button> : <section className="document-review" aria-label="Review document request">
      <h3>Review rollout</h3>
      <p><strong>{title}</strong> · {file?.name}</p>
      <p><strong>{selected.size} existing agent{selected.size === 1 ? "" : "s"}</strong> selected.</p>
      <p><strong>Delivery:</strong> {deliveryLabel[delivery]}</p>
      <p>{onboarding ? `Future onboarding: ${audienceLabel(onboardingAudience)}.` : "Future onboarding: not included."}</p>
      {onboarding && selected.size > 0 && <p><strong>Order:</strong> {orderLabel[effectiveOrder]}. {effectiveOrder !== "together" && "You choose when to start the second stage."}</p>}
      {recipients && recipients.length > 0 && <>
        <div className="document-section-heading"><span>{recipients.length} matching agents</span><button className="admin-secondary-btn" disabled={locked} onClick={() => setSelected(selected.size === recipients.length ? new Set() : new Set(recipients.map(row => row.id)))}>{selected.size === recipients.length ? "Clear selection" : "Select all matches"}</button></div>
        <div className="admin-table-wrap document-recipient-table"><table className="admin-table"><thead><tr><th>Select</th><th>Agent</th><th>Type</th><th>State</th><th>ICA</th></tr></thead><tbody>
          {recipients.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.id)} disabled={locked} onChange={() => setSelected(prev => { const next = new Set(prev); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} /></td><td>{row.name}<small>{row.email}</small></td><td>{row.designation.toUpperCase()}</td><td>{row.state || "—"}</td><td>{row.ica_signed ? "Signed" : "Not signed"}</td></tr>)}
        </tbody></table></div>
      </>}
      {existingAgents && recipients?.length === 0 && <p role="status">No agents match these filters. Change the filters or publish for future onboarding only.</p>}
      <p>The uploaded PDF is fixed once published. Upload a new request if the document changes.</p>
      <button className="admin-primary-btn" disabled={busy || !!publishedId || (!selected.size && !onboarding)} onClick={() => void publish()}><Send size={17} />{busy ? "Publishing…" : attempted.current ? "Retry publication" : selected.size && onboarding ? "Start rollout" : selected.size ? `Send to ${selected.size} agent${selected.size === 1 ? "" : "s"}` : "Publish for future onboarding"}</button>
    </section>}
  </div>;
}

function CampaignDetail({ campaign, token, onChanged, onBack, onNotify, busy }: {
  campaign: DocumentCampaign; token: string; onChanged: () => Promise<void>; onBack: () => void;
  onNotify: (id: string) => Promise<void>; busy: boolean;
}) {
  const [rows, setRows] = useState<DocumentRecipientStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(campaign.onboarding_enabled);
  const [audience, setAudience] = useState(campaign.onboarding_audience);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [url, setUrl] = useState("");
  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await documentRequestReport(token, campaign.id)); } catch (err) { setError(message(err)); } finally { setLoading(false); }
  }, [token, campaign.id]);
  useEffect(() => { void reload(); }, [reload, campaign.signed_count, campaign.email_pending_count, campaign.held_count]);
  useEffect(() => { setEnabled(campaign.onboarding_enabled); setAudience(campaign.onboarding_audience); }, [campaign.onboarding_enabled, campaign.onboarding_audience]);
  const visible = rows.filter(row => (status === "all" || (status === "signed" ? !!row.signed_at : status === "held" ? !row.released_at : !!row.released_at && !row.signed_at)) && `${row.name} ${row.email}`.toLowerCase().includes(search.toLowerCase()));
  const open = async (requestId?: string) => {
    setError(""); setUrl("");
    try { setUrl(await adminDocumentUrl(token, campaign.id, requestId)); } catch (err) { setError(message(err)); }
  };
  const save = async () => {
    setSaving(true); setError("");
    try { await setDocumentOnboarding(token, campaign.id, enabled, audience); await onChanged(); } catch (err) { setError(message(err)); } finally { setSaving(false); }
  };
  const releaseCurrent = async () => {
    setSaving(true); setError("");
    try {
      await releaseDocumentCurrentAgents(token, campaign.id); await onChanged();
      if (campaign.delivery_mode !== "portal") await onNotify(campaign.id);
    } catch (err) { setError(message(err)); } finally { setSaving(false); }
  };
  const startOnboarding = async () => {
    setSaving(true); setError("");
    try { await setDocumentOnboarding(token, campaign.id, true, campaign.onboarding_audience); await onChanged(); }
    catch (err) { setError(message(err)); } finally { setSaving(false); }
  };
  return <div className="document-compose">
    <div className="document-section-heading"><h2>{campaign.title}</h2><button className="admin-secondary-btn" onClick={onBack}><ArrowLeft size={16} />All requests</button></div>
    <p>{campaign.description}</p>
    <section className="document-step" aria-label="Rollout progress"><h3>Rollout progress</h3>
      <p><strong>Delivery:</strong> {deliveryLabel[campaign.delivery_mode]}</p>
      <p><strong>Order:</strong> {campaign.current_count === 0 ? "Future onboarding only" : !campaign.onboarding_enabled && !campaign.onboarding_pending && campaign.rollout_order === "together" ? "Current agents only" : orderLabel[campaign.rollout_order]}</p>
      <ol className="document-stages">
        {(campaign.rollout_order === "onboarding_first" ? ["onboarding", "current"] : ["current", "onboarding"]).map(stage => stage === "current" ?
          <li key={stage}><div><strong>Current agents</strong><p>{campaign.held_count ? `${campaign.held_count} selected agents · waiting for you to start` : campaign.current_count ? `${campaign.current_count} agents · released` : "Not included"}</p></div>{campaign.held_count > 0 && <button className="admin-primary-btn" disabled={saving || busy} onClick={() => void releaseCurrent()}>Start current-agent rollout</button>}</li> :
          <li key={stage}><div><strong>Future onboarding · {audienceLabel(campaign.onboarding_audience)}</strong><p>{campaign.onboarding_enabled ? "Active for new accounts" : campaign.onboarding_pending ? "Waiting for you to start" : "Not active"}</p></div>{campaign.onboarding_pending && <button className="admin-primary-btn" disabled={saving || busy} onClick={() => void startOnboarding()}>Start future onboarding</button>}</li>)}
      </ol>
      {(campaign.held_count > 0 || campaign.onboarding_pending) && <p>The next stage starts only when you choose. You can wait for signatures or start it sooner.</p>}
    </section>
    <div className="document-stats"><span><strong>{campaign.recipient_count}</strong> released recipients</span><span><strong>{campaign.signed_count}</strong> signed</span><span><strong>{campaign.recipient_count - campaign.signed_count}</strong> awaiting signature</span></div>
    <div className="document-actions"><button className="admin-secondary-btn" onClick={() => void open()}>View original PDF</button><button className="admin-secondary-btn" disabled={busy || campaign.email_pending_count === 0} onClick={() => void onNotify(campaign.id)}><Send size={16} />{busy ? "Sending emails…" : `Send pending emails (${campaign.email_pending_count})`}</button><button className="admin-secondary-btn" disabled={loading || busy} onClick={() => void Promise.all([reload(), onChanged()])}><RefreshCw size={16} />Refresh status</button></div>
    {url && <a className="admin-secondary-link" href={url} target="_blank" rel="noopener noreferrer">Open document PDF ↗</a>}
    {error && <p role="alert" className="admin-error">{error}</p>}
    <section className="document-step"><h3>Future onboarding</h3>
      <label className="document-check"><input type="checkbox" checked={enabled} disabled={saving} onChange={e => setEnabled(e.target.checked)} />Required for future new agents</label>
      <label className="admin-field"><span>Onboarding audience</span><select value={audience} disabled={saving} onChange={e => setAudience(e.target.value as DocumentAudience)}><AudienceOptions /></select></label>
      <p>Turning this off stops new assignments. Existing requests and signed copies remain. Turning it back on starts with accounts created from that point forward.</p>
      <button className="admin-secondary-btn" disabled={saving || (enabled === campaign.onboarding_enabled && audience === campaign.onboarding_audience)} onClick={() => void save()}>{saving ? "Saving…" : "Save onboarding settings"}</button>
    </section>
    <div className="document-filter-grid"><label className="admin-field"><span>Search recipients</span><input value={search} onChange={e => setSearch(e.target.value)} /></label><label className="admin-field"><span>Signature status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All recipients</option><option value="pending">Awaiting signature</option><option value="held">Waiting for rollout</option><option value="signed">Signed</option></select></label></div>
    {loading ? <p role="status">Loading recipients…</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Agent</th><th>Type</th><th>Signature</th><th>Email</th><th>Document</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td>{row.name}<small>{row.email}</small></td><td>{row.designation.toUpperCase()}<small>{row.source === "onboarding" ? "Onboarding" : "Rollout"}</small></td><td>{row.signed_at ? `Signed ${new Date(row.signed_at).toLocaleDateString()}` : !row.released_at ? "Waiting for rollout" : "Awaiting signature"}<small>{row.signature_name}</small></td><td>{row.notification_status === "none" ? !row.released_at ? "Not released" : "Not requested" : row.notification_status}<small>{row.notification_error}</small></td><td>{row.signed_at && <button className="admin-secondary-btn" onClick={() => void open(row.id)}>Signed PDF</button>}</td></tr>)}</tbody></table>{!visible.length && <p className="document-empty">No recipients to show{campaign.onboarding_enabled ? ". Future agents appear here when they first open their portal." : "."}</p>}</div>}
  </div>;
}

export default function AdminDocumentRequests() {
  const { session } = useAuth(); const token = session?.access_token ?? "";
  const [campaigns, setCampaigns] = useState<DocumentCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [compose, setCompose] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const reload = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try { setCampaigns(await listDocumentCampaigns(token)); setError(""); } catch (err) { setError(message(err)); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { document.title = "Document requests — PNCL Admin"; void reload(); }, [reload]);
  const notify = async (id: string) => {
    if (sending) return;
    setSending(true); setError(""); let sent = 0; let notificationError = "";
    try {
      for (;;) {
        const result = await notifyDocumentRecipients(token, id); sent += result.sent;
        setNotice(`Requests are published. ${sent} email${sent === 1 ? "" : "s"} sent in this run; ${result.remaining} remaining.`);
        if (result.failed || result.remaining === 0 || result.sent === 0) {
          if (result.failed) notificationError = "Some emails could not be sent. The portal requests are available; use Send pending emails to retry.";
          break;
        }
      }
    } catch (err) { notificationError = `Requests are published. Email delivery needs attention: ${message(err)}`; }
    finally { setSending(false); await reload(); if (notificationError) setError(notificationError); }
  };
  const published = async (id: string, sendEmails: boolean) => {
    setCompose(false); setDetail(id); setNotice("Rollout saved. Released agents can review and sign; any later stage waits for you to start it.");
    await reload(); if (sendEmails) await notify(id);
  };
  const campaign = campaigns.find(row => row.id === detail);
  return <section className="admin-panel admin-document-requests">
    <div className="admin-panel-head"><FileSignature size={24} /><div><h1>Document requests</h1><p>Send documents for signature and manage required onboarding documents.</p></div></div>
    <OnboardingAdminNav />
    {notice && <p role="status" className="document-notice">{notice}{sending && " Keep this page open while emails are sent."}</p>}
    {error && <p role="alert" className="admin-error">{error} <button className="admin-secondary-btn" onClick={() => void reload()}>Reload</button></p>}
    {compose ? <ComposeDocument token={token} onCancel={() => { setCompose(false); void reload(); }} onPublished={published} /> : campaign ? <CampaignDetail key={campaign.id} campaign={campaign} token={token} onChanged={reload} onBack={() => setDetail(null)} onNotify={notify} busy={sending} /> : <>
      <div className="document-section-heading"><h2>Requests</h2><button className="admin-primary-btn" disabled={!token || sending || !!error} onClick={() => { setCompose(true); setNotice(""); }}><Plus size={18} />New document request</button></div>
      {loading ? <p role="status">Loading document requests…</p> : campaigns.length === 0 ? <div className="document-empty"><FileSignature size={32} /><h3>No document requests yet</h3><p>Upload a PDF, choose who needs to sign, and optionally add it to onboarding for new LOA or IBO agents.</p></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Document</th><th>Signatures</th><th>Future onboarding</th><th>Email delivery</th><th>Manage</th></tr></thead><tbody>{campaigns.map(row => <tr key={row.id}><td><strong>{row.title}</strong><small>Published {new Date(row.created_at).toLocaleDateString()}</small></td><td>{row.signed_count} / {row.recipient_count} signed{row.held_count > 0 && <small>{row.held_count} waiting for rollout</small>}</td><td>{row.onboarding_enabled ? audienceLabel(row.onboarding_audience) : row.onboarding_pending ? "Waiting for rollout" : "Not active"}</td><td>{row.email_pending_count ? `${row.email_pending_count} pending` : "Up to date"}</td><td><button className="admin-secondary-btn" onClick={() => setDetail(row.id)}>View request</button></td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}
