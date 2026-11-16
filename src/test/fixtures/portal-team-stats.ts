import type { PortalTeamStats } from '@/lib/portal-team-stats';
export function teamStatsFixture(): PortalTeamStats {
  return { version: 1, asOf: '2026-11-16T17:00:00Z', period: { key: 'month', from: '2026-11-01', to: '2026-11-16', timezone: 'America/Boise' }, people: [
    { id: 'leader', state: 'connected', metrics: { annualPremiumCents: 100000, dials: 100, sets: 10, closes: 2 } },
    { id: 'direct', state: 'connected', metrics: { annualPremiumCents: 200000, dials: 150, sets: 20, closes: 3 } },
    { id: 'indirect', state: 'not_linked', metrics: null },
    { id: 'partner-a', state: 'connected', metrics: { annualPremiumCents: 300000, dials: 200, sets: 30, closes: 4 } },
    { id: 'partner-b', state: 'connected', metrics: { annualPremiumCents: 0, dials: 0, sets: 0, closes: 0 } },
  ] };
}
