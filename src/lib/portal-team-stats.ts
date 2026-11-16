import { getSupabaseConfig } from '@/lib/supabase';
export type { PortalTeamStats, TeamMetrics, TeamStatsPerson, TeamStatsPeriod } from '../../supabase/functions/_shared/portalTeamStats';
import type { PortalTeamStats, TeamStatsPeriod, TeamStatsPerson, TeamMetrics } from '../../supabase/functions/_shared/portalTeamStats';

export const TEAM_PERIOD_LABELS: Record<TeamStatsPeriod, string> = { week: 'This week', month: 'This month', last30: 'Last 30 days' };
export const premium = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function totalTeamStats(ids: string[], people: TeamStatsPerson[] = []) {
  const selected = new Set(ids);
  const metrics: TeamMetrics = { annualPremiumCents: 0, dials: 0, sets: 0, closes: 0 };
  const connected = new Set<string>();
  for (const person of people) {
    if (!selected.has(person.id) || person.state !== 'connected' || connected.has(person.id)) continue;
    connected.add(person.id);
    for (const field of Object.keys(metrics) as (keyof TeamMetrics)[]) metrics[field] += person.metrics[field];
  }
  return { metrics: connected.size ? metrics : null, connected: connected.size, total: selected.size };
}

export async function getPortalTeamStats(token: string, period: TeamStatsPeriod, signal?: AbortSignal): Promise<PortalTeamStats | null> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/get-portal-team-stats?period=${period}`, {
    signal, headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Unable to load LeadSpply stats');
  if (data.state === 'no_hierarchy') return null;
  return data;
}
