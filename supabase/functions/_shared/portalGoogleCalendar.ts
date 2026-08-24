import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
  GOOGLE_CALENDAR_PREVIEW_DAYS,
  GOOGLE_CALENDAR_PREVIEW_LIMIT,
  isCalendarScopeGranted,
  toCachedGoogleCalendarEvent,
  type CachedGoogleCalendarEvent,
  type GoogleCalendarEvent,
} from "./googleCalendar.ts";

export interface GoogleCalendarOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  siteUrl: string;
}

export interface GoogleTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
}

export class GoogleCalendarAuthorizationError extends Error {
  constructor(message = "Google Calendar authorization is no longer valid") {
    super(message);
    this.name = "GoogleCalendarAuthorizationError";
  }
}

function requiredEnvironmentValue(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validateServerUrl(name: string, value: string): string {
  const url = new URL(value);
  const localHttp = url.protocol === "http:"
    && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error(`${name} must use HTTPS (or localhost HTTP for development)`);
  }
  return url.toString();
}

export function getGoogleCalendarOAuthConfig(): GoogleCalendarOAuthConfig {
  return {
    clientId: requiredEnvironmentValue("GOOGLE_CALENDAR_CLIENT_ID"),
    clientSecret: requiredEnvironmentValue("GOOGLE_CALENDAR_CLIENT_SECRET"),
    redirectUri: validateServerUrl(
      "GOOGLE_CALENDAR_REDIRECT_URI",
      requiredEnvironmentValue("GOOGLE_CALENDAR_REDIRECT_URI"),
    ),
    siteUrl: validateServerUrl("PNCL_SITE_URL", requiredEnvironmentValue("PNCL_SITE_URL")),
  };
}

interface GoogleErrorDetails {
  code: string;
  message: string;
}

async function readGoogleError(response: Response): Promise<GoogleErrorDetails> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as {
      error?: string | {
        status?: string;
        message?: string;
        errors?: Array<{ reason?: string }>;
      };
      error_description?: string;
    };
    if (typeof parsed.error === "string") {
      return {
        code: parsed.error,
        message: parsed.error_description ?? parsed.error,
      };
    }
    if (parsed.error && typeof parsed.error === "object") {
      return {
        code: parsed.error.errors?.[0]?.reason ?? parsed.error.status ?? "google_request_failed",
        message: parsed.error.message ?? `Google request failed (${response.status})`,
      };
    }
  } catch {
    // Return the intentionally generic fallback below. Provider bodies are not
    // logged or returned to the browser by the calling Edge Functions.
  }
  return {
    code: "google_request_failed",
    message: `Google request failed (${response.status})`,
  };
}

export async function exchangeGoogleAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  config: GoogleCalendarOAuthConfig;
}): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: input.config.redirectUri,
    }),
  });

  if (!response.ok) {
    const googleError = await readGoogleError(response);
    throw new Error(googleError.message);
  }

  const payload = await response.json() as Record<string, unknown>;
  if (typeof payload.access_token !== "string" || !isCalendarScopeGranted(payload.scope)) {
    throw new GoogleCalendarAuthorizationError("Required Google Calendar permission was not granted");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : 3600,
    scope: payload.scope as string,
  };
}

export async function refreshGoogleCalendarAccessToken(input: {
  refreshToken: string;
  config: GoogleCalendarOAuthConfig;
}): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const googleError = await readGoogleError(response);
    if (googleError.code === "invalid_grant") {
      throw new GoogleCalendarAuthorizationError();
    }
    throw new Error(googleError.message);
  }

  const payload = await response.json() as Record<string, unknown>;
  if (typeof payload.access_token !== "string") {
    throw new Error("Google did not return an access token");
  }

  const scope = typeof payload.scope === "string"
    ? payload.scope
    : GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE;
  if (!isCalendarScopeGranted(scope)) {
    throw new GoogleCalendarAuthorizationError("Required Google Calendar permission was not granted");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : 3600,
    scope,
  };
}

export async function fetchGoogleCalendarPreview(
  accessToken: string,
  now = new Date(),
): Promise<{ events: CachedGoogleCalendarEvent[]; windowEnd: string }> {
  const windowEnd = new Date(
    now.getTime() + GOOGLE_CALENDAR_PREVIEW_DAYS * 24 * 60 * 60 * 1000,
  );
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", now.toISOString());
  url.searchParams.set("timeMax", windowEnd.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("maxResults", String(GOOGLE_CALENDAR_PREVIEW_LIMIT));
  url.searchParams.set(
    "fields",
    "items(summary,visibility,status,start,end,hangoutLink,conferenceData(entryPoints(entryPointType,uri)),location,description)",
  );

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const googleError = await readGoogleError(response);
    if (response.status === 401) {
      throw new GoogleCalendarAuthorizationError();
    }
    throw new Error(googleError.message);
  }

  const payload = await response.json() as { items?: GoogleCalendarEvent[] };
  const events = (payload.items ?? [])
    .map(toCachedGoogleCalendarEvent)
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .slice(0, GOOGLE_CALENDAR_PREVIEW_LIMIT);

  return { events, windowEnd: windowEnd.toISOString() };
}

export async function replaceGoogleCalendarPreview(
  adminClient: SupabaseClient,
  userId: string,
  accessToken: string,
): Promise<{ eventCount: number; syncedAt: string; windowEnd: string }> {
  const syncedAt = new Date().toISOString();
  const { events, windowEnd } = await fetchGoogleCalendarPreview(accessToken, new Date(syncedAt));

  const { error: deleteError } = await adminClient
    .from("portal_google_calendar_events")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  if (events.length > 0) {
    const { error: insertError } = await adminClient
      .from("portal_google_calendar_events")
      .insert(events.map((event) => ({ ...event, user_id: userId, cached_at: syncedAt })));
    if (insertError) throw new Error(insertError.message);
  }

  const { error: updateError } = await adminClient
    .from("portal_google_calendar_connections")
    .update({
      status: "connected",
      last_synced_at: syncedAt,
      sync_window_end: windowEnd,
      last_error_code: null,
    })
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);

  return { eventCount: events.length, syncedAt, windowEnd };
}

export async function markGoogleCalendarAuthorizationExpired(
  adminClient: SupabaseClient,
  userId: string,
): Promise<void> {
  const results = await Promise.all([
    adminClient
      .from("portal_google_calendar_connections")
      .update({ status: "reauthorization_required", last_error_code: "authorization_expired" })
      .eq("user_id", userId),
    adminClient.from("portal_google_calendar_events").delete().eq("user_id", userId),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(error.message);
}

export async function revokeGoogleCalendarToken(refreshToken: string): Promise<boolean> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
    // An already-invalid token is effectively revoked for this application.
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}
