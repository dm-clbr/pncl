export type TeamStatsPeriod = 'week' | 'month' | 'last30';
export interface TeamMetrics { annualPremiumCents: number; dials: number; sets: number; closes: number; }
export type TeamStatsPerson = { id: string } & (
  | { state: 'connected'; metrics: TeamMetrics }
  | { state: 'not_linked' | 'account_unavailable'; metrics: null }
);
export interface PortalTeamStats {
  version: 1;
  asOf: string;
  period: { key: TeamStatsPeriod; from: string; to: string; timezone: 'America/Boise' };
  people: TeamStatsPerson[];
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid stats');
  return value as Record<string, unknown>;
};
const date = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Invalid date');
  return value;
};
const count = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid metric');
  return value;
};

/** Never relay upstream payloads. Keep only explicitly permitted PNCL identities and fields. */
export function sanitizePortalTeamStats(raw: unknown, allowedIds: string[], periodKey: TeamStatsPeriod): PortalTeamStats {
  const data = record(raw), period = record(data.period);
  if (data.version !== 1 || period.key !== periodKey || period.timezone !== 'America/Boise'
    || typeof data.asOf !== 'string' || !Number.isFinite(Date.parse(data.asOf)) || !Array.isArray(data.people)) throw new Error('Invalid stats');
  const from = date(period.from), to = date(period.to);
  if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 31) throw new Error('Invalid period');
  const allowed = new Set(allowedIds), seen = new Set<string>();
  const people: TeamStatsPerson[] = [];
  for (const rawPerson of data.people) {
    const person = record(rawPerson);
    if (typeof person.id !== 'string' || !allowed.has(person.id)) continue;
    if (seen.has(person.id)) throw new Error('Duplicate person');
    seen.add(person.id);
    if (person.state === 'not_linked' || person.state === 'account_unavailable') {
      people.push({ id: person.id, state: person.state, metrics: null });
    } else if (person.state === 'connected') {
      const metrics = record(person.metrics);
      people.push({ id: person.id, state: 'connected', metrics: {
        annualPremiumCents: count(metrics.annualPremiumCents), dials: count(metrics.dials),
        sets: count(metrics.sets), closes: count(metrics.closes),
      } });
    } else throw new Error('Invalid connection state');
  }
  if (seen.size !== allowed.size) throw new Error('Incomplete stats');
  return { version: 1, asOf: data.asOf, period: { key: periodKey, from, to, timezone: 'America/Boise' }, people };
}
