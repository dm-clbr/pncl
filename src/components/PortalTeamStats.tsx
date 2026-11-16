import { premium, totalTeamStats, type TeamMetrics, type TeamStatsPerson } from '@/lib/portal-team-stats';

export function TeamMetricValues({ metrics }: { metrics: TeamMetrics | null }) {
  return <>
    <div><dt>Annual premium</dt><dd>{metrics ? premium(metrics.annualPremiumCents) : '—'}</dd></div>
    <div><dt>Dials</dt><dd>{metrics?.dials.toLocaleString() ?? '—'}</dd></div>
    <div><dt>Sets</dt><dd>{metrics?.sets.toLocaleString() ?? '—'}</dd></div>
    <div><dt>Closes</dt><dd>{metrics?.closes.toLocaleString() ?? '—'}</dd></div>
  </>;
}

export function TeamCardMetrics({ ids, people, loading, error }: {
  ids: string[]; people?: TeamStatsPerson[]; loading: boolean; error: string | null;
}) {
  const { metrics, connected, total } = totalTeamStats(ids, people);
  if (loading) return <span className="portal-team-card-stats">Loading stats…</span>;
  if (error || !people) return <span className="portal-team-card-stats">Stats unavailable</span>;
  if (!metrics) return <span className="portal-team-card-stats">{ids.every(id => people.find(p => p.id === id)?.state === 'not_linked') ? 'LeadSpply not linked' : 'Stats unavailable'}</span>;
  return <span className="portal-team-card-stats">
    <strong>{premium(metrics.annualPremiumCents)} <small>AP</small></strong>
    <span>{metrics.dials.toLocaleString()} dials · {metrics.sets.toLocaleString()} sets · {metrics.closes.toLocaleString()} closes</span>
    {connected < total && <small>{connected}/{total} linked accounts</small>}
  </span>;
}
