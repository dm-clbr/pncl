import { describe, expect, it } from 'vitest';
import { sanitizePortalTeamStats } from '../../supabase/functions/_shared/portalTeamStats';
import { totalTeamStats } from '@/lib/portal-team-stats';
import { teamStatsFixture } from '@/test/fixtures/portal-team-stats';

describe('team stats payload boundary', () => {
  it('allowlists both fields and permitted identities, even if upstream returns extra data', () => {
    const data = teamStatsFixture();
    const raw = { ...data, secret: 'private', people: data.people.map(p => ({...p, email:'private', customer:'private'})) };
    const clean = sanitizePortalTeamStats(raw, ['direct'], 'month');
    expect(clean.people).toEqual([data.people[1]]);
    expect(JSON.stringify(clean)).not.toMatch(/private|leader|partner/);
  });
  it('rejects partial, duplicate, wrong-period, invalid-date and malformed metrics instead of claiming zero', () => {
    const data = teamStatsFixture();
    expect(() => sanitizePortalTeamStats(data, ['absent'], 'month')).toThrow();
    expect(() => sanitizePortalTeamStats({...data, people:[data.people[0],data.people[0]]}, ['leader'], 'month')).toThrow();
    expect(() => sanitizePortalTeamStats(data, ['leader'], 'week')).toThrow();
    expect(() => sanitizePortalTeamStats({...data,period:{...data.period,from:'2026-02-30'}}, ['leader'], 'month')).toThrow();
    for (const value of [-1, Infinity, 1.5, '25', null]) {
      const person = {...data.people[0],metrics:{annualPremiumCents:value,dials:1,sets:1,closes:1}};
      expect(() => sanitizePortalTeamStats({...data,people:[person]}, ['leader'], 'month')).toThrow();
    }
  });
  it('sums a branch once, excludes other branches, and distinguishes no data from valid zero', () => {
    const data = teamStatsFixture();
    expect(totalTeamStats(['direct','direct','indirect'], data.people)).toMatchObject({connected:1,total:2,metrics:{annualPremiumCents:200000}});
    expect(totalTeamStats(['indirect'], data.people).metrics).toBeNull();
    expect(totalTeamStats(['partner-b'], data.people).metrics?.annualPremiumCents).toBe(0);
  });
});
