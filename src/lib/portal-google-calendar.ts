import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

export type PortalGoogleCalendarStatus = "connected" | "reauthorization_required";

export interface PortalGoogleCalendarConnection {
  status: PortalGoogleCalendarStatus;
  scope: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  syncWindowEnd: string | null;
  lastErrorCode: "sync_failed" | "authorization_expired" | null;
}

export interface PortalGoogleCalendarEvent {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  startDate: string | null;
  endDate: string | null;
  allDay: boolean;
  calendarContext: string;
  joinUrl: string | null;
  cachedAt: string;
}

export interface PortalGoogleCalendarData {
  connection: PortalGoogleCalendarConnection | null;
  events: PortalGoogleCalendarEvent[];
}

export class PortalGoogleCalendarApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "PortalGoogleCalendarApiError";
    this.code = code;
    this.status = status;
  }
}

async function calendarFunctionRequest<T>(
  accessToken: string,
  functionName: string,
  method: "GET" | "POST",
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${functionName}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new PortalGoogleCalendarApiError(
      typeof payload.message === "string" ? payload.message : "Google Calendar request failed",
      typeof payload.error === "string" ? payload.error : "request_failed",
      response.status,
    );
  }
  return payload as T;
}

export async function fetchPortalGoogleCalendar(
  accessToken: string,
): Promise<PortalGoogleCalendarData> {
  if (!isSupabaseAuthConfigured()) return { connection: null, events: [] };
  return calendarFunctionRequest<PortalGoogleCalendarData>(
    accessToken,
    "get-portal-google-calendar",
    "GET",
  );
}

export async function startPortalGoogleCalendarOAuth(accessToken: string): Promise<string> {
  const result = await calendarFunctionRequest<{ authorizationUrl: string }>(
    accessToken,
    "start-portal-google-calendar-oauth",
    "POST",
  );
  const authorizationUrl = new URL(result.authorizationUrl);
  if (authorizationUrl.protocol !== "https:" || authorizationUrl.hostname !== "accounts.google.com") {
    throw new Error("Calendar authorization returned an invalid destination");
  }
  return authorizationUrl.toString();
}

export async function syncPortalGoogleCalendar(accessToken: string): Promise<void> {
  await calendarFunctionRequest(accessToken, "sync-portal-google-calendar", "POST");
}

export interface DisconnectPortalGoogleCalendarResult {
  disconnected: boolean;
  revoked: boolean;
  message: string;
}

export async function disconnectPortalGoogleCalendar(
  accessToken: string,
): Promise<DisconnectPortalGoogleCalendarResult> {
  return calendarFunctionRequest<DisconnectPortalGoogleCalendarResult>(
    accessToken,
    "disconnect-portal-google-calendar",
    "POST",
  );
}

export function calendarEventSortValue(event: PortalGoogleCalendarEvent): number {
  const value = event.allDay
    ? event.startDate && `${event.startDate}T00:00:00`
    : event.startsAt;
  const time = value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

export function formatCalendarEventDate(event: PortalGoogleCalendarEvent): string {
  const value = event.allDay
    ? event.startDate && `${event.startDate}T00:00:00`
    : event.startsAt;
  if (!value) return "Upcoming";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatCalendarEventTime(event: PortalGoogleCalendarEvent): string {
  if (event.allDay) return "All day";
  if (!event.startsAt) return "Time unavailable";
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const start = formatter.format(new Date(event.startsAt));
  if (!event.endsAt) return start;
  return `${start} – ${formatter.format(new Date(event.endsAt))}`;
}
