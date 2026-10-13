import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { integrationName, manageLeadSpplyIntegration, type IntegrationPreview } from "@/lib/portal-leadspply-integration";
import { trackPageView } from "@/lib/analytics";

type MatchFilter = "all" | "linked" | "suggested" | "name_review" | "conflict" | "unmatched";
const statuses: MatchFilter[] = ["all", "linked", "suggested", "name_review", "conflict", "unmatched"];
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "—";

export default function AdminLeadSpplyIntegration() {
  const { session, user, loading: authLoading } = useAuth();
  const [preview, setPreview] = useState<IntegrationPreview | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MatchFilter>("all");
  const [page, setPage] = useState(1);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stalePreview, setStalePreview] = useState(false);
  const tokenRef = useRef(session?.access_token); tokenRef.current = session?.access_token;
  const ownerRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const userId = user?.id; const sessionUserId = session?.user?.id;
  const currentUserRef = useRef(userId); currentUserRef.current = userId;
  const pageSize = 25;

  const load = useCallback(async () => {
    const generation = ++requestRef.current; controllerRef.current?.abort();
    setPreview(null); ownerRef.current = null; setBusy(false); setSelected({}); setReviewed(false); setStalePreview(false); setMessage(null); setError(null); setPage(1);
    const token = tokenRef.current;
    if (!userId || userId !== sessionUserId || !token) { setLoading(false); return; }
    const controller = new AbortController(); controllerRef.current = controller; setLoading(true);
    try { const result = await manageLeadSpplyIntegration<IntegrationPreview>(token, { action: "preview" }, controller.signal); if (generation === requestRef.current && !controller.signal.aborted) { ownerRef.current = userId; setPreview(result); } }
    catch (err) { if (!controller.signal.aborted && generation === requestRef.current) setError(err instanceof Error ? err.message : "Unable to load the integration review."); }
    finally { if (!controller.signal.aborted && generation === requestRef.current) setLoading(false); }
  }, [sessionUserId, userId]);

  useEffect(() => { document.title = "LeadSpply integration — PNCL Admin"; trackPageView("admin_leadspply_integration"); }, []);
  useEffect(() => { if (!authLoading) void load(); }, [authLoading, load]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const safePreview = userId && userId === sessionUserId && ownerRef.current === userId ? preview : null;

  const linked = useMemo(() => new Map(safePreview?.links.map((item) => [item.pncl_user_id, item.leadspply_user_id])), [safePreview]);
  const proposed = useMemo(() => new Map([...linked, ...Object.entries(selected).filter(([, id]) => id)]), [linked, selected]);
  const visible = useMemo(() => (safePreview?.matches ?? []).filter((match) => {
    const text = `${integrationName(match.source)} ${match.source.email} ${match.source.personal_email ?? ""} ${match.source.npn ?? ""}`.toLowerCase();
    return (filter === "all" || match.status === filter) && text.includes(query.trim().toLowerCase());
  }), [filter, safePreview?.matches, query]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const matches = visible.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const label = (id: string | null | undefined) => { if (!id) return "No upline"; const target = safePreview?.targets.find((item) => item.id === id); return target ? integrationName(target) : "Unlinked upline"; };
  const actorLabel = (pnclId: string | null, leadspplyId?: string | null) => {
    const source = safePreview?.matches.find(match => match.source.id === pnclId)?.source;
    if (source) return integrationName(source);
    const target = safePreview?.targets.find(rep => rep.id === leadspplyId);
    return target ? integrationName(target) : pnclId ? "PNCL administrator" : leadspplyId ? "LeadSpply administrator" : "System";
  };
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const sync = async () => {
    const token = tokenRef.current;
    if (!token || !safePreview || !reviewed || stalePreview || userId !== sessionUserId) return;
    const actor = userId;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await manageLeadSpplyIntegration<{ linked: number; synced: number; unresolved: number }>(token, {
        action: "sync", token: safePreview.token,
        links: Object.entries(selected).filter(([, id]) => id).map(([pncl_user_id, leadspply_user_id]) => ({ pncl_user_id, leadspply_user_id })),
      });
      if (currentUserRef.current !== actor) return;
      await load();
      if (currentUserRef.current === actor) setMessage(`Linked ${result.linked} accounts. Synced ${result.synced} reps. ${result.unresolved} need follow-up.`);
    } catch (err) {
      if (currentUserRef.current !== actor) return;
      const stale = (err as Error & { code?: string }).code === "preview_stale";
      setReviewed(false);
      setStalePreview(stale);
      setError(stale ? "This preview is stale. Refresh and review changes before syncing." : err instanceof Error ? err.message : "Unable to sync the integration.");
    } finally { if (currentUserRef.current === actor) setBusy(false); }
  };

  return <section className="admin-panel leadspply-admin-panel">
    <div className="admin-panel-head"><ShieldCheck size={22} aria-hidden="true" /><div><h1>LeadSpply integration</h1><p>PNCL is the source of truth for rep links, hierarchy, and pay tiers. Review every account link before a manual sync.</p></div></div>
    <div className="admin-toolbar leadspply-toolbar">
      <label className="admin-field admin-field-grow"><span>Search</span><input aria-label="Search PNCL reps" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Name, PNCL email, or NPN" /></label>
      <label className="admin-field"><span>Status</span><select value={filter} onChange={(event) => { setFilter(event.target.value as MatchFilter); setPage(1); }}>{statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}</select></label>
      <button type="button" className="admin-icon-btn" onClick={() => void load()} disabled={loading || busy}><RefreshCw size={16} aria-hidden="true" /> Refresh review</button>
    </div>
    {loading || authLoading ? <div className="onboarding-spinner admin-spinner" aria-label="Loading integration review" /> : null}
    {error ? <p className="admin-error" role="alert">{error}</p> : null}
    {message ? <p className="admin-success" role="status">{message}</p> : null}
    {safePreview && <>
      <div className="leadspply-summary" aria-label="Integration summary">{statuses.slice(1).map((status) => <span key={status}>{status.replace(/_/g, " ")}: <strong>{safePreview.matches.filter((match) => match.status === status).length}</strong></span>)}<span>Awaiting manual sync: <strong>{safePreview.links.filter(item => item.sync_status === "pending").length}</strong></span><span>Uplines needing review: <strong>{safePreview.links.filter((item) => item.sync_status === "upline_unlinked").length}</strong></span></div>
      <div className="admin-table-wrap"><table className="admin-table leadspply-review-table"><thead><tr><th>PNCL rep</th><th>Match</th><th>LeadSpply profile</th><th>Tier</th><th>Hierarchy after sync</th><th>Last sync</th></tr></thead><tbody>{matches.map((match) => {
        const existing = linked.get(match.source.id); const targetId = existing ?? selected[match.source.id] ?? "";
        const newParent = match.source.parent_id ? proposed.get(match.source.parent_id) : null;
        const target = safePreview.targets.find((item) => item.id === targetId);
        const used = (id: string) => [...proposed.entries()].some(([sourceId, currentId]) => sourceId !== match.source.id && currentId === id);
        const oldParent = target?.parent_id ?? null;
        return <tr key={match.source.id}><td><strong>{integrationName(match.source)}</strong><br /><small>{match.source.email}<br />NPN {match.source.npn ?? "—"}</small></td><td><strong>{match.status.replace(/_/g, " ")}</strong><br /><small>{match.reason}</small></td><td>{existing ? <><strong>{label(existing)}</strong><br /><small>Existing link</small></> : <select aria-label={`LeadSpply profile for ${integrationName(match.source)}`} value={targetId} disabled={busy || loading} onChange={(event) => { setSelected((current) => ({ ...current, [match.source.id]: event.target.value })); setReviewed(false); }}><option value="">Choose after review</option>{safePreview.targets.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={used(candidate.id)}>{integrationName(candidate)} · {candidate.email} · NPN {candidate.npn ?? "—"}</option>)}</select>}{target && !existing && <small className="leadspply-match-note">Manual selection pending review</small>}</td><td>{match.source.comp_level ?? "Not assigned"}{match.source.comp_effective_at && <small>Since {date(match.source.comp_effective_at)}</small>}</td><td>{targetId ? <>{match.source.parent_id ? <>New: {label(newParent)}</> : "New: No upline"}{oldParent !== newParent && <small>Current: {label(oldParent)}</small>}{match.source.parent_id && !newParent && <small className="leadspply-match-note">Unlinked PNCL upline clears the current parent.</small>}</> : "Link this rep first"}</td><td>{date(safePreview.links.find((item) => item.pncl_user_id === match.source.id)?.synced_at)}</td></tr>;
      })}</tbody></table></div>
      {visible.length > pageSize && <div className="leadspply-pagination"><button type="button" className="admin-secondary-btn" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {Math.min(page, pageCount)} of {pageCount} · {visible.length} reps</span><button type="button" className="admin-secondary-btn" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
      <section className="leadspply-sync-review"><p>Sync is manual. It applies PNCL tiers and hierarchy to linked accounts. Name-only matches and conflicts need an administrator’s explicit selection. Carrier commission mapping is separate.</p><label><input type="checkbox" checked={reviewed} disabled={busy || loading || stalePreview} onChange={(event) => setReviewed(event.target.checked)} /> I reviewed the selected identities, uplines, co-manager pairs, and pay tiers.</label><button type="button" className="admin-primary-btn" disabled={busy || loading || stalePreview || !reviewed || proposed.size === 0} onClick={() => void sync()}>{busy ? "Syncing…" : `Sync ${proposed.size} linked reps (${selectedCount} new links)`}</button></section>
      <section className="leadspply-audit"><h2>Co-manager pairs</h2>{safePreview.partners.length === 0 ? <p>No co-manager pairs exported.</p> : <ul>{safePreview.partners.map((pair) => <li key={`${pair.user_id_a}-${pair.user_id_b}`}>{safePreview.matches.find((match) => match.source.id === pair.user_id_a) ? integrationName(safePreview.matches.find((match) => match.source.id === pair.user_id_a)!.source) : "PNCL rep"} + {safePreview.matches.find((match) => match.source.id === pair.user_id_b) ? integrationName(safePreview.matches.find((match) => match.source.id === pair.user_id_b)!.source) : "PNCL rep"} · shared hierarchy</li>)}</ul>}<h2>Recent manual runs</h2>{safePreview.recentRuns.length === 0 ? <p>No manual sync runs yet.</p> : <ul>{safePreview.recentRuns.slice(0, 8).map((run) => <li key={run.id}>{date(run.created_at)} · revision {run.revision} · {run.linked_count} linked, {run.synced_count} synced, {run.unresolved_count} unresolved · By {actorLabel(run.pncl_actor_id, run.actor_id)}</li>)}</ul>}<h2>Recent audit events</h2>{safePreview.events.length === 0 ? <p>No audit events yet.</p> : <ul>{safePreview.events.slice(0, 8).map((event) => <li key={event.id}>{date(event.created_at)} · {event.kind.replace(/_/g, " ")} · {actorLabel(event.pncl_actor_id)}{event.pncl_user_id && ` · ${actorLabel(event.pncl_user_id)}`}</li>)}</ul>}</section>
    </>}
  </section>;
}
