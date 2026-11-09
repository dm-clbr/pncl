import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronDown, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import SummitShell from "@/components/summit/SummitShell";
import { getSummitSnapshot, SUMMIT_REFRESH_MS, type SummitGroup, type SummitSnapshot } from "@/lib/summit";
import SummitOriginals from "@/components/summit/SummitOriginals";
import SummitSlides from "@/components/summit/SummitSlides";

export function SummitGroupsTable({ groups }: { groups: SummitGroup[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  function toggle(id: string) { setExpanded((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  return (
    <div className="summit-table-wrap">
      <table className="summit-table">
        <caption className="sr-only">All question groups, ranked by number of submissions. Expand a question to read every original submission.</caption>
        <thead><tr><th scope="col">Rank</th><th scope="col">Audience question</th><th scope="col" className="summit-count-heading">Submissions</th></tr></thead>
        <tbody>{groups.map((group, index) => (
          <Fragment key={group.id}>
            <tr className={expanded.has(group.id) ? "is-expanded" : ""}>
              <td className="summit-rank">{String(index + 1).padStart(2, "0")}</td>
              <th scope="row"><button className="summit-group-button" onClick={() => toggle(group.id)} aria-expanded={expanded.has(group.id)} aria-controls={`originals-${group.id}`}><span>{group.representative}</span><ChevronDown size={20} aria-hidden="true" /></button></th>
              <td className="summit-count">{group.count}</td>
            </tr>
            <tr id={`originals-${group.id}`} hidden={!expanded.has(group.id)} className="summit-originals-row"><td colSpan={3}>{expanded.has(group.id) && <SummitOriginals groupId={group.id} count={group.count} />}</td></tr>
          </Fragment>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function SummitPresenter() {
  const client = useQueryClient();
  const [showPending,setShowPending] = useState(false);
  const [presentation,setPresentation] = useState<SummitGroup[]|null>(null);
  const { data, error, isPending, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["summit-presenter"], queryFn: () => getSummitSnapshot(client.getQueryData<SummitSnapshot>(["summit-presenter"])),
    refetchInterval: SUMMIT_REFRESH_MS, refetchIntervalInBackground: true,
    refetchOnWindowFocus: true, retry: 1,
  });
  const canPresent=Boolean(data && data.groups.length>0 && data.pending_count===0 && !error);
  if(presentation)return <SummitShell title="Question presentation" mode="presenter"><SummitSlides groups={presentation} onExit={()=>setPresentation(null)} canRefresh={canPresent} onRefresh={()=>{if(canPresent && data)setPresentation([...data.groups]);}}/></SummitShell>;
  return (
    <SummitShell title="Presenter dashboard" mode="presenter">
      <main className="summit-presenter">
        <div className="summit-presenter-heading"><div><p className="summit-eyebrow">Presenter dashboard</p><h1>The room,<br /><em>in their words.</em></h1></div><Link className="summit-stage-link" to="/summit" target="_blank" rel="noreferrer">Open event screen <ArrowUpRight size={18} /></Link></div>
        <div className="summit-summary"><div><strong>{data?.total ?? "—"}</strong><span>Questions received</span></div><div><strong>{data?.groups.length ?? "—"}</strong><span>Question groups</span></div><div className="summit-sync"><span className={`summit-dot${error ? " is-offline" : ""}`} /><span>{error ? "Connection interrupted" : "Updates every 3 seconds"}</span><button onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh questions"><RefreshCw size={18} className={isFetching ? "summit-spinner" : ""} /></button></div></div>
        {error && <p role="alert" className="summit-error">{error instanceof Error ? error.message : "Unable to load questions."} {data ? "Showing the last received results. Reconnecting automatically." : "Retrying automatically."}</p>}
        {data && (!data.ai_configured || data.last_error) && <p role="status" className="summit-notice">{!data.ai_configured ? "AI grouping needs to be connected." : "AI grouping is temporarily delayed. We’ll retry automatically."} All submitted questions are saved and remain visible below.</p>}
        <div className="summit-table-intro"><div><h2>Every question. Ranked by the room.</h2><p>Similar questions are grouped by meaning. Expand any row to read every original.</p></div><div className="summit-presentation-entry"><button className="summit-present-button" disabled={!canPresent} onClick={()=>{if(data)setPresentation([...data.groups]);}}>Present slides <ArrowUpRight size={18}/></button><p>{data?.pending_count ? "Available when all saved questions are grouped." : "One slide for every group, in ranked order."}</p></div></div>
        {isPending ? <p role="status" className="summit-empty">Loading audience questions…</p> : data && data.groups.length > 0 ? <SummitGroupsTable groups={data.groups} /> : <div className="summit-empty"><h3>{data?.pending_count ? "The first questions are coming in." : "Ready when the room is."}</h3><p>{data?.pending_count ? "Groups will appear here as AI processes the submissions." : "Show the QR code on the event screen to invite your first question."}</p></div>}
        {data && data.pending_count > 0 && <section className="summit-pending"><h2>Waiting to be grouped <span>{data.pending_count.toLocaleString()}</span></h2><p>Every question is saved. The ranked list updates as the queue clears. A large surge may take a few minutes to process.</p><button className="summit-text-button" onClick={() => setShowPending(!showPending)} aria-expanded={showPending}>{showPending ? "Hide" : "View"} waiting questions</button>{showPending && <SummitOriginals key={`pending-${data.pending_count}`} groupId={null} count={data.pending_count} />}</section>}
        {data && <p className="summit-updated" aria-live="polite">{data.total} questions received · {data.groups.length} groups · {data.pending_count} waiting to be grouped<span aria-hidden="true"> · Updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span></p>}
      </main>
    </SummitShell>
  );
}
