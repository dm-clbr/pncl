export const GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
export const GOOGLE_CALENDAR_PREVIEW_DAYS = 14;
export const GOOGLE_CALENDAR_PREVIEW_LIMIT = 10;
export const GOOGLE_CALENDAR_CONTEXT = "Primary calendar";

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateOAuthState(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function generatePkceVerifier(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(48)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

export interface GoogleAuthorizationUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

export function buildGoogleAuthorizationUrl(input: GoogleAuthorizationUrlInput): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type CalendarCallbackResult = "connected" | "canceled" | "error";
export type CalendarCallbackReason =
  | "invalid_state"
  | "expired_state"
  | "missing_code"
  | "permission_missing"
  | "token_exchange_failed"
  | "sync_failed";

export function buildPortalCalendarReturnUrl(
  configuredSiteUrl: string,
  result: CalendarCallbackResult,
  reason?: CalendarCallbackReason,
): string {
  const configured = new URL(configuredSiteUrl);
  const localHttp = configured.protocol === "http:"
    && (configured.hostname === "localhost" || configured.hostname === "127.0.0.1");
  if (configured.protocol !== "https:" && !localHttp) {
    throw new Error("PNCL_SITE_URL must use HTTPS (or localhost HTTP for development)");
  }

  const destination = new URL("/portal/calendar", configured.origin);
  destination.searchParams.set("calendar", result);
  if (reason) destination.searchParams.set("reason", reason);
  return destination.toString();
}

export function isCalendarScopeGranted(scopeValue: unknown): boolean {
  if (typeof scopeValue !== "string") return false;
  return scopeValue.split(/\s+/).includes(GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE);
}

interface GoogleEventDateTime {
  date?: string;
  dateTime?: string;
}

interface GoogleConferenceEntryPoint {
  entryPointType?: string;
  uri?: string;
}

export interface GoogleCalendarEvent {
  status?: string;
  summary?: string;
  visibility?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  hangoutLink?: string;
  location?: string;
  description?: string;
  conferenceData?: {
    entryPoints?: GoogleConferenceEntryPoint[];
  };
}

export interface CachedGoogleCalendarEvent {
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  start_date: string | null;
  end_date: string | null;
  is_all_day: boolean;
  calendar_context: typeof GOOGLE_CALENDAR_CONTEXT;
  join_url: string | null;
}

function safeEventTitle(event: GoogleCalendarEvent): string {
  if (event.visibility === "private" || event.visibility === "confidential") {
    return "Private event";
  }
  const summary = event.summary?.replace(/\s+/g, " ").trim();
  return summary ? summary.slice(0, 160) : "Busy";
}

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isValidDateTime(value: string | undefined): value is string {
  return Boolean(value && Number.isFinite(new Date(value).getTime()));
}

const MAX_JOIN_URL_LENGTH = 2048;

function hasPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (!normalized.includes(".")) return false;
  if (
    normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || normalized.includes(":")
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)
  ) {
    return false;
  }
  return true;
}

function normalizePublicHttpsUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_JOIN_URL_LENGTH) return null;
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:"
      || Boolean(url.username)
      || Boolean(url.password)
      || (url.port && url.port !== "443")
      || !hasPublicHostname(url.hostname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function isHostOrSubdomain(hostname: string, rootDomain: string): boolean {
  return hostname === rootDomain || hostname.endsWith(`.${rootDomain}`);
}

function isApprovedTextFallback(url: URL): boolean {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const path = url.pathname;

  if (hostname === "meet.google.com") {
    return /^\/(?:[a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[A-Za-z0-9._-]+)\/?$/.test(path);
  }
  if (isHostOrSubdomain(hostname, "zoom.us")) {
    return /^\/(?:j|s|my)\/[A-Za-z0-9._-]+\/?$/.test(path)
      || /^\/wc\/join\/[A-Za-z0-9._-]+\/?$/.test(path);
  }
  if (hostname === "teams.microsoft.com") {
    return path.startsWith("/l/meetup-join/") || path.startsWith("/meet/");
  }
  if (hostname === "teams.live.com") {
    return path.startsWith("/meet/");
  }
  if (isHostOrSubdomain(hostname, "webex.com")) {
    return path.startsWith("/meet/")
      || path.startsWith("/join/")
      || path.startsWith("/webappng/sites/");
  }
  if (hostname === "meet.jit.si") {
    return /^\/[A-Za-z0-9._-]+\/?$/.test(path);
  }
  if (hostname === "meet.goto.com") {
    return /^\/[A-Za-z0-9-]+\/?$/.test(path);
  }
  if (hostname === "global.gotomeeting.com") {
    return /^\/join\/[0-9]+\/?$/.test(path);
  }
  return false;
}

function extractHttpsCandidates(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  const decoded = value.replace(/&amp;/gi, "&");
  const matches = decoded.match(/https:\/\/[^\s<>"']+/gi) ?? [];
  return matches.map((candidate) => candidate.replace(/[),.;!\]}]+$/g, ""));
}

/**
 * Prefers a Google Calendar structured video entry point. Location/description
 * are inspected only in memory and only accepted for narrowly recognized
 * conferencing providers; their raw contents are never returned or cached.
 */
export function resolveGoogleCalendarJoinUrl(event: GoogleCalendarEvent): string | null {
  const structuredVideoEntries = event.conferenceData?.entryPoints
    ?.filter((entry) => entry.entryPointType === "video") ?? [];
  for (const entry of structuredVideoEntries) {
    const url = normalizePublicHttpsUrl(entry.uri);
    if (url) return url.toString();
  }

  const structuredMeetUrl = normalizePublicHttpsUrl(event.hangoutLink);
  if (structuredMeetUrl && isApprovedTextFallback(structuredMeetUrl)) {
    return structuredMeetUrl.toString();
  }

  for (const source of [event.location, event.description]) {
    for (const candidate of extractHttpsCandidates(source)) {
      const url = normalizePublicHttpsUrl(candidate);
      if (url && isApprovedTextFallback(url)) return url.toString();
    }
  }
  return null;
}

/**
 * Reduces a Google event to the only fields retained by PNCL. Attendees,
 * raw descriptions/locations, organizers, and Google event IDs are
 * deliberately ignored. At most one validated conference join URL is retained.
 */
export function toCachedGoogleCalendarEvent(
  event: GoogleCalendarEvent,
): CachedGoogleCalendarEvent | null {
  if (event.status === "cancelled") return null;

  if (isIsoDate(event.start?.date) && isIsoDate(event.end?.date)) {
    return {
      title: safeEventTitle(event),
      starts_at: null,
      ends_at: null,
      start_date: event.start.date,
      end_date: event.end.date,
      is_all_day: true,
      calendar_context: GOOGLE_CALENDAR_CONTEXT,
      join_url: resolveGoogleCalendarJoinUrl(event),
    };
  }

  if (isValidDateTime(event.start?.dateTime) && isValidDateTime(event.end?.dateTime)) {
    return {
      title: safeEventTitle(event),
      starts_at: event.start.dateTime,
      ends_at: event.end.dateTime,
      start_date: null,
      end_date: null,
      is_all_day: false,
      calendar_context: GOOGLE_CALENDAR_CONTEXT,
      join_url: resolveGoogleCalendarJoinUrl(event),
    };
  }

  return null;
}
