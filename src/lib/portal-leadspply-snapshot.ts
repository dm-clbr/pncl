import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

export interface LeadSpplySnapshot {
  version: 1;
  state: "connected" | "not_linked" | "account_unavailable";
  asOf: string;
  account?: {
    name: string;
    syncStatus: string;
    lastSyncedAt: string | null;
  };
  period?: {
    timezone: string;
    monthStart: string;
    weekStart: string;
    today: string;
  };
  leads?: { toWork: number; new: number; inProgress: number; callbacksToday: number };
  appointments?: { upcoming: number; nextAt: string | null };
  production?: { paidPoliciesMtd: number; annualPremiumCentsMtd: number };
  activity?: {
    today: { calls: number; appointments: number; presentations: number; policies: number; points: number };
    week: { calls: number; appointments: number; presentations: number; policies: number; points: number };
  };
  contact?: { ratePct: number | null; speedMinutes: number | null };
}

const states = new Set<LeadSpplySnapshot["state"]>(["connected", "not_linked", "account_unavailable"]);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isIso = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const count = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const string = (value: unknown): string | null => typeof value === "string" ? value : null;
const nullableNumber = (value: unknown): number | null | undefined => value === null ? null : count(value) ?? undefined;

function readCounts(value: unknown): { calls: number; appointments: number; presentations: number; policies: number; points: number } | null {
  if (!isRecord(value)) return null;
  const calls = count(value.calls);
  const appointments = count(value.appointments);
  const presentations = count(value.presentations);
  const policies = count(value.policies);
  const points = count(value.points);
  return calls === null || appointments === null || presentations === null || policies === null || points === null
    ? null
    : { calls, appointments, presentations, policies, points };
}

/** Maps only the published, read-only DTO fields into portal state. */
export function parseLeadSpplySnapshot(value: unknown): LeadSpplySnapshot {
  if (!isRecord(value) || value.version !== 1 || !states.has(value.state as LeadSpplySnapshot["state"]) || !isIso(value.asOf)) {
    throw new Error("LeadSpply returned an invalid snapshot.");
  }

  const state = value.state as LeadSpplySnapshot["state"];
  if (state !== "connected") return { version: 1, state, asOf: value.asOf };

  const account = isRecord(value.account) ? value.account : null;
  const period = isRecord(value.period) ? value.period : null;
  const leads = isRecord(value.leads) ? value.leads : null;
  const appointments = isRecord(value.appointments) ? value.appointments : null;
  const production = isRecord(value.production) ? value.production : null;
  const activity = isRecord(value.activity) ? value.activity : null;
  const contact = isRecord(value.contact) ? value.contact : null;
  const accountName = account && string(account.name);
  const syncStatus = account && string(account.syncStatus);
  const lastSyncedAt = account?.lastSyncedAt;
  const timezone = period && string(period.timezone);
  const monthStart = period?.monthStart;
  const weekStart = period?.weekStart;
  const today = period?.today;
  const toWork = leads && count(leads.toWork);
  const fresh = leads && count(leads.new);
  const inProgress = leads && count(leads.inProgress);
  const callbacksToday = leads && count(leads.callbacksToday);
  const upcoming = appointments && count(appointments.upcoming);
  const nextAt = appointments?.nextAt;
  const paidPoliciesMtd = production && count(production.paidPoliciesMtd);
  const annualPremiumCentsMtd = production && count(production.annualPremiumCentsMtd);
  const todayActivity = activity && readCounts(activity.today);
  const weekActivity = activity && readCounts(activity.week);
  const ratePct = contact && nullableNumber(contact.ratePct);
  const speedMinutes = contact && nullableNumber(contact.speedMinutes);

  if (!accountName || !syncStatus || (lastSyncedAt !== null && !isIso(lastSyncedAt)) || !timezone || !isDate(monthStart) || !isDate(weekStart) || !isDate(today)
    || toWork === null || fresh === null || inProgress === null || callbacksToday === null || upcoming === null || (nextAt !== null && !isIso(nextAt))
    || paidPoliciesMtd === null || annualPremiumCentsMtd === null || !todayActivity || !weekActivity || !contact || ratePct === undefined || speedMinutes === undefined) {
    throw new Error("LeadSpply returned an invalid snapshot.");
  }

  return {
    version: 1,
    state,
    asOf: value.asOf,
    account: { name: accountName, syncStatus, lastSyncedAt: lastSyncedAt as string | null },
    period: { timezone, monthStart, weekStart, today },
    leads: { toWork, new: fresh, inProgress, callbacksToday },
    appointments: { upcoming, nextAt: nextAt as string | null },
    production: { paidPoliciesMtd, annualPremiumCentsMtd },
    activity: { today: todayActivity, week: weekActivity },
    contact: { ratePct, speedMinutes },
  };
}

export async function fetchLeadSpplySnapshot(accessToken: string, signal?: AbortSignal): Promise<LeadSpplySnapshot> {
  if (!isSupabaseAuthConfigured()) throw new Error("LeadSpply data is unavailable in this environment.");
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/get-leadspply-snapshot`, {
    method: "GET",
    signal,
    headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey },
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(data) && typeof data.message === "string" ? data.message : "Unable to load LeadSpply data.";
    throw new Error(message);
  }
  return parseLeadSpplySnapshot(data);
}
