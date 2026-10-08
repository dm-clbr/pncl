export interface LeadSpplySnapshot {
  version: 1;
  state: 'connected' | 'not_linked' | 'account_unavailable';
  asOf: string;
  account?: { name: string; syncStatus: string; lastSyncedAt: string | null };
  period?: { timezone: string; monthStart: string; weekStart: string; today: string };
  leads?: { toWork: number; new: number; inProgress: number; callbacksToday: number };
  appointments?: { upcoming: number; nextAt: string | null };
  production?: { paidPoliciesMtd: number; annualPremiumCentsMtd: number };
  activity?: { today: Activity; week: Activity };
  contact?: { ratePct: number | null; speedMinutes: number | null };
}
interface Activity { calls: number; appointments: number; presentations: number; policies: number; points: number }
const fail = (): never => { throw new Error('Invalid LeadSpply snapshot'); };
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
  return v as Record<string, unknown>;
}
function text(v: unknown, maximum = 200): string {
  if (typeof v !== 'string' || !v.trim() || v.length > maximum) return fail();
  return v;
}
function iso(v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(Date.parse(v))) return fail();
  return v;
}
function date(v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail();
  const parsed = new Date(`${v}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0,10) !== v) return fail();
  return v;
}
function number(v: unknown, integer = true): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (integer && !Number.isSafeInteger(v))) return fail();
  return v;
}
function activity(v: unknown): Activity {
  const a = record(v);
  return { calls:number(a.calls),appointments:number(a.appointments),presentations:number(a.presentations),policies:number(a.policies),points:number(a.points,false) };
}

/** Project only the approved aggregate fields; never relay an upstream object. */
export function sanitizeLeadSpplySnapshot(value: unknown): LeadSpplySnapshot {
  const v = record(value);
  if (v.version !== 1 || !['connected','not_linked','account_unavailable'].includes(String(v.state))) return fail();
  const base: LeadSpplySnapshot = { version:1,state:v.state as LeadSpplySnapshot['state'],asOf:iso(v.asOf) };
  if (base.state !== 'connected') return base;
  const a=record(v.account),p=record(v.period),l=record(v.leads),b=record(v.appointments),r=record(v.production),w=record(v.activity),c=record(v.contact);
  const timezone=text(p.timezone,100);
  try { new Intl.DateTimeFormat('en-US',{timeZone:timezone}); } catch { return fail(); }
  const syncStatus=text(a.syncStatus,50);
  if (!['pending','synced','upline_unlinked'].includes(syncStatus)) return fail();
  const ratePct=c.ratePct===null ? null : number(c.ratePct,false);
  if (ratePct !== null && ratePct > 100) return fail();
  return { ...base,
    account:{ name:text(a.name),syncStatus,lastSyncedAt:a.lastSyncedAt===null ? null : iso(a.lastSyncedAt) },
    period:{ timezone,monthStart:date(p.monthStart),weekStart:date(p.weekStart),today:date(p.today) },
    leads:{ toWork:number(l.toWork),new:number(l.new),inProgress:number(l.inProgress),callbacksToday:number(l.callbacksToday) },
    appointments:{ upcoming:number(b.upcoming),nextAt:b.nextAt===null ? null : iso(b.nextAt) },
    production:{ paidPoliciesMtd:number(r.paidPoliciesMtd),annualPremiumCentsMtd:number(r.annualPremiumCentsMtd) },
    activity:{ today:activity(w.today),week:activity(w.week) },
    contact:{ ratePct,speedMinutes:c.speedMinutes===null ? null : number(c.speedMinutes,false) },
  };
}
