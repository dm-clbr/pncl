import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, GitBranch, ListTree, Maximize, Minimize, Network, RefreshCw, UserPlus } from "lucide-react";
import { HierarchyCanvas } from "@/components/admin/HierarchyCanvas";
import { HierarchyTree } from "@/components/admin/HierarchyTree";
import { useAdminModal } from "@/components/admin/useAdminModal";
import PortalHierarchyDetails from "@/components/PortalHierarchyDetails";
import EmptyState from "@/components/portal/EmptyState";
import Skeleton from "@/components/portal/Skeleton";
import { usePortalTeamStats } from '@/hooks/usePortalTeamStats';
import { TEAM_PERIOD_LABELS, totalTeamStats, type TeamStatsPeriod } from '@/lib/portal-team-stats';
import { TeamCardMetrics, TeamMetricValues } from '@/components/PortalTeamStats';
import type { AssistHierarchyNode, HierarchyNode } from '@/lib/admin-api';
import { usePortalHierarchy } from "@/hooks/usePortalHierarchy";
import { findAssistHierarchyNode } from "@/lib/hierarchy-utils";
import { countHierarchyPeople, toPortalCanvasTree } from "@/lib/portal-hierarchy";
import "@/styles/portal-admin.css";
import "@/styles/portal-hierarchy.css";

export default function PortalHierarchyPanel() {
  const { data, loading, error, reload } = usePortalHierarchy();
  const [period, setPeriod] = useState<TeamStatsPeriod>('month');
  const stats = usePortalTeamStats(period);
  const [view, setView] = useState<"chart" | "list">("chart");
  const [rootId, setRootId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [levels, setLevels] = useState(Infinity);
  const [focus, setFocus] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const focusId = data?.focusOptions.some((person) => person.id === rootId) ? rootId : "";
  const focusedNode = focusId ? findAssistHierarchyNode(data?.tree ?? [], focusId) : null;
  const tree = useMemo(() => focusedNode ? [focusedNode] : data?.tree ?? [], [focusedNode, data]);
  const selectedNode = selectedId ? findAssistHierarchyNode(tree, selectedId) : null;
  const canvasTree = useMemo(() => toPortalCanvasTree(tree, data?.people ?? [], levels), [tree, data, levels]);
  useAdminModal(frame, focus && !selectedNode, () => setFocus(false));

  const rootIds = new Set(data?.tree.flatMap((node) => node.memberIds ?? [node.id]) ?? []);
  const downline = data?.people.filter((person) => !rootIds.has(person.id)) ?? [];
  const directCount = data?.tree.reduce((total, node) => total + node.children.reduce((n, child) => n + (child.members?.length ?? 1), 0), 0) ?? 0;
  const readyCount = downline.filter((person) => person.phase === "sales_ready" || person.phase === "complete").length;
  const inProgressCount = downline.filter((person) => person.phase && person.phase !== "sales_ready" && person.phase !== "complete").length;

  const branchIds: string[] = [];
  const collect = (nodes: AssistHierarchyNode[]) => nodes.forEach(node => {
    branchIds.push(...(node.memberIds ?? [node.id])); collect(node.children);
  });
  collect(tree);
  const totals = totalTeamStats(branchIds, stats.data?.people);
  const renderMetrics = (node: HierarchyNode | AssistHierarchyNode) => <TeamCardMetrics
    ids={node.memberIds ?? [node.id]} people={stats.data?.people} loading={stats.loading} error={stats.error} />;

  function focusOn(personId: string) {
    setRootId(personId);
    setSelectedId(null);
  }

  return (
    <div ref={frame} className={`portal-team-hierarchy admin-dash${focus ? " is-focused" : ""}`}
      role={focus ? "dialog" : undefined} aria-modal={focus ? true : undefined}
      aria-label={focus ? "Team hierarchy focus view" : undefined} tabIndex={focus ? -1 : undefined}>
      <div className="portal-hierarchy-heading">
        <p className="portal-profile-lede">Your team, at every level. Select a person for comp, production, and onboarding details.</p>
        <div className="portal-hierarchy-actions">
          <div className="admin-hierarchy-view-toggle" role="group" aria-label="Hierarchy view">
            {(["chart", "list"] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode}
              className={`admin-hierarchy-view-btn${view === mode ? " admin-hierarchy-view-btn-active" : ""}`}
              onClick={() => { setView(mode); setSelectedId(null); }}>
              {mode === "chart" ? <Network size={16} aria-hidden="true" /> : <ListTree size={16} aria-hidden="true" />}{mode === "chart" ? "Chart" : "List"}
            </button>)}
          </div>
          <button className="portal-profile-btn" type="button" aria-pressed={focus} onClick={() => setFocus(!focus)}>
            {focus ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}{focus ? "Exit focus" : "Focus"}
          </button>
          {!focus && <Link className="portal-profile-btn" to="/portal/profile?tab=team"><UserPlus size={16} aria-hidden="true" /> Invite</Link>}
        </div>
      </div>
      {loading ? <div className="portal-hierarchy-state" aria-busy="true" aria-label="Loading team hierarchy"><Skeleton variant="row" /><Skeleton variant="row" /></div>
        : error ? <div className="portal-hierarchy-state portal-profile-error" role="alert">
          <p>We couldn&apos;t load your team hierarchy right now.</p>
          <button className="portal-profile-btn" type="button" onClick={() => void reload()}>Try again</button>
        </div>
        : tree.length === 0 ? <EmptyState icon={<GitBranch size={22} aria-hidden="true" />} title="No hierarchy yet"
          body="Your hierarchy will appear here once your portal account is connected." />
        : <>
          {!focus && <dl className="portal-hierarchy-summary" aria-label="Team summary">
            {[["Total downline", downline.length], ["Direct reports", directCount], ["Onboarding", inProgressCount], ["Sales ready", readyCount]].map(([label, count]) =>
              <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
          </dl>}
          <section className="portal-team-production" aria-label="LeadSpply team stats">
            <div className="portal-hierarchy-toolbar">
              <div className="portal-team-production-heading"><strong>LeadSpply production</strong>
                <span>{focusId ? 'Selected branch' : 'Your team, including you'} · {stats.loading ? 'Loading stats…' : stats.error ? 'Stats unavailable' : `${totals.connected}/${totals.total} accounts with stats`}</span></div>
              <label className="admin-field"><span>Stats period</span><select value={period} onChange={event => setPeriod(event.target.value as TeamStatsPeriod)}>
                {Object.entries(TEAM_PERIOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select></label>
            </div>
            {stats.loading ? <p className="portal-team-stats-note" role="status">Loading LeadSpply stats…</p>
              : stats.error ? <div className="portal-team-stats-note" role="status">LeadSpply stats are unavailable. Your hierarchy is still available. <button className="portal-profile-btn" onClick={() => void stats.reload()}>Retry stats</button></div>
              : <>
                {!focus && <dl className="portal-hierarchy-summary" aria-label="Production totals"><TeamMetricValues metrics={totals.metrics} /></dl>}
                {!focus && <p className="portal-team-stats-note">
                  {stats.data ? `${stats.data.period.from} – ${stats.data.period.to} · Mountain time · Updated ${new Date(stats.data.asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. ` : ''}
                  {totals.connected < totals.total ? 'Totals include linked, available accounts only. ' : ''}
                  AP is annual premium by application date. Sets and closes follow LeadSpply activity.
                </p>}
              </>}
          </section>
          <div className="portal-hierarchy-frame">
            <div className="portal-hierarchy-toolbar">
              <span className="portal-hierarchy-caption"><strong>{countHierarchyPeople(tree)} {countHierarchyPeople(tree) === 1 ? "person" : "people"}</strong> · {view === "chart" ? "Drag to pan · select for details" : "Expand a branch · select for details"}</span>
              <button className="portal-profile-btn" type="button" aria-label="Refresh team" onClick={() => { void reload(); void stats.reload(); }}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>
              <div className="portal-hierarchy-levels" role="group" aria-label="Levels">
                <span>Levels</span>
                {[2, 3, Infinity].map((value) => <button key={value} type="button" aria-label={value === Infinity ? "All levels" : `${value} levels`}
                  aria-pressed={levels === value} onClick={() => setLevels(value)}>{value === Infinity ? "All" : value}</button>)}
              </div>
            </div>
            <div className="portal-hierarchy-branch">
              {focusId && <button className="portal-profile-btn portal-hierarchy-back" type="button" aria-label="Back to my team" title="Back to my team" onClick={() => focusOn("")}><ArrowLeft size={15} aria-hidden="true" /><span>Back to my team</span></button>}
              <label className="admin-field"><span>Focus on team member</span>
                <select value={focusId} onChange={(event) => focusOn(event.target.value)}>
                  <option value="">My entire team</option>
                  {data?.focusOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </label>
            </div>
            {view === "chart" ? <HierarchyCanvas key={`${focusId}-${levels}`} tree={canvasTree} selectedNodeId={selectedId} initialView="root" cardSize="large" cardScale={0.9} renderMetrics={renderMetrics} onSelectNode={setSelectedId} />
              : <HierarchyTree key={`${focusId}-${levels}`} tree={canvasTree} selectedNodeId={selectedId} renderMetrics={renderMetrics} onSelectNode={setSelectedId} />}
          </div>
          {downline.length === 0 && <p className="portal-profile-lede">Your team starts with you. Use Invite to recruit agents; they appear here when their portal accounts are linked to you.</p>}
          {selectedNode && <PortalHierarchyDetails node={selectedNode} people={data?.people ?? []} stats={stats.data} statsLoading={stats.loading} statsError={stats.error} period={period} onClose={() => setSelectedId(null)} onFocus={focusOn} />}
        </>}
    </div>
  );
}
