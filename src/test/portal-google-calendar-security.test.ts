import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGoogleAuthorizationUrl,
  buildPortalCalendarReturnUrl,
  GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
  isCalendarScopeGranted,
  resolveGoogleCalendarJoinUrl,
  toCachedGoogleCalendarEvent,
} from "../../supabase/functions/_shared/googleCalendar";

describe("portal Google Calendar OAuth and privacy", () => {
  it("builds a state- and PKCE-bound authorization request with read-only events scope", () => {
    const authorizationUrl = new URL(buildGoogleAuthorizationUrl({
      clientId: "calendar-client.apps.googleusercontent.com",
      redirectUri: "https://project.supabase.co/functions/v1/portal-google-calendar-callback",
      state: "opaque-state",
      codeChallenge: "pkce-challenge",
    }));

    expect(authorizationUrl.origin).toBe("https://accounts.google.com");
    expect(authorizationUrl.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE);
    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline");
    expect(authorizationUrl.searchParams.get("state")).toBe("opaque-state");
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe("pkce-challenge");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("scope")).not.toBe(
      "https://www.googleapis.com/auth/calendar.events",
    );
  });

  it("allows only the required granted scope and uses a server-configured return origin", () => {
    expect(isCalendarScopeGranted(GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE)).toBe(true);
    expect(isCalendarScopeGranted("https://www.googleapis.com/auth/calendar.events")).toBe(false);

    const returnUrl = new URL(buildPortalCalendarReturnUrl(
      "https://portal.thepncl.com/untrusted-path?next=https://evil.example",
      "connected",
    ));
    expect(returnUrl.origin).toBe("https://portal.thepncl.com");
    expect(returnUrl.pathname).toBe("/portal/calendar");
    expect(returnUrl.searchParams.get("calendar")).toBe("connected");
    expect(returnUrl.searchParams.has("next")).toBe(false);
    expect(() => buildPortalCalendarReturnUrl("http://evil.example", "error"))
      .toThrow("must use HTTPS");
  });

  it("redacts private titles and retains only bounded preview fields", () => {
    const privateEvent = toCachedGoogleCalendarEvent({
      summary: "Sensitive client meeting",
      visibility: "private",
      start: { dateTime: "2026-08-25T09:00:00-04:00" },
      end: { dateTime: "2026-08-25T10:00:00-04:00" },
    });
    expect(privateEvent).toEqual({
      title: "Private event",
      starts_at: "2026-08-25T09:00:00-04:00",
      ends_at: "2026-08-25T10:00:00-04:00",
      start_date: null,
      end_date: null,
      is_all_day: false,
      calendar_context: "Primary calendar",
      join_url: null,
    });

    expect(toCachedGoogleCalendarEvent({
      summary: "Company offsite",
      start: { date: "2026-08-28" },
      end: { date: "2026-08-29" },
    })).toMatchObject({
      title: "Company offsite",
      start_date: "2026-08-28",
      end_date: "2026-08-29",
      is_all_day: true,
    });
    expect(toCachedGoogleCalendarEvent({
      status: "cancelled",
      start: { date: "2026-08-28" },
      end: { date: "2026-08-29" },
    })).toBeNull();
  });

  it("prefers a public HTTPS structured video entry point", () => {
    expect(resolveGoogleCalendarJoinUrl({
      conferenceData: {
        entryPoints: [
          { entryPointType: "phone", uri: "tel:+15551234567" },
          { entryPointType: "video", uri: "https://video.vendor.example/room/abc?token=123" },
        ],
      },
      description: "Backup https://zoom.us/j/999999?pwd=backup",
    })).toBe("https://video.vendor.example/room/abc?token=123");
  });

  it("accepts a narrowly allowlisted HTTPS fallback without retaining source text", () => {
    const event = {
      summary: "Team sync",
      location: "Zoom room: https://acme.zoom.us/j/123456789?pwd=secret",
      description: "Agenda and notes that must not be cached",
      start: { dateTime: "2026-08-25T09:00:00Z" },
      end: { dateTime: "2026-08-25T09:30:00Z" },
    };
    expect(resolveGoogleCalendarJoinUrl(event)).toBe(
      "https://acme.zoom.us/j/123456789?pwd=secret",
    );
    const cached = toCachedGoogleCalendarEvent(event);
    expect(cached?.join_url).toBe("https://acme.zoom.us/j/123456789?pwd=secret");
    expect(cached).not.toHaveProperty("description");
    expect(cached).not.toHaveProperty("location");
  });

  it("rejects unsafe or lookalike fallback URLs", () => {
    const unsafeEvents = [
      { description: "http://zoom.us/j/123456" },
      { description: "https://zoom.us.evil.example/j/123456" },
      { description: "https://zoom.us@evil.example/j/123456" },
      { description: "https://localhost/meet/secret" },
      { description: "https://127.0.0.1/j/123456" },
      { description: "https://example.com/zoom.us/j/123456" },
    ];
    for (const event of unsafeEvents) {
      expect(resolveGoogleCalendarJoinUrl(event)).toBeNull();
    }
  });

  it("returns no join URL when an event has no usable conference link", () => {
    expect(resolveGoogleCalendarJoinUrl({
      location: "PNCL headquarters",
      description: "Agenda: review the weekly dashboard.",
    })).toBeNull();
  });

  it("keeps tokens server-only and applies owner RLS to visible data", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260824000000_portal_google_calendar.sql"),
      "utf8",
    );
    const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
    const frontend = readFileSync(
      resolve(process.cwd(), "src/lib/portal-google-calendar.ts"),
      "utf8",
    );

    for (const table of [
      "portal_google_calendar_connections",
      "portal_google_calendar_credentials",
      "portal_google_calendar_oauth_attempts",
      "portal_google_calendar_events",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from anon, authenticated`);
    }
    expect(migration).toContain("using ((select auth.uid()) = user_id)");
    expect(migration).not.toContain(
      "grant select on table public.portal_google_calendar_credentials to authenticated",
    );
    expect(migration).not.toContain("Users can read own Google Calendar credentials");
    expect(migration).toContain("join_url text");
    expect(migration).toContain("calendar_context, join_url, cached_at");
    expect(config).toContain("[functions.portal-google-calendar-callback]\nverify_jwt = false");
    expect(config).toContain("[functions.sync-portal-google-calendar]\nverify_jwt = true");
    expect(frontend).not.toContain("localStorage");
    expect(frontend).not.toContain("refreshToken");
  });

  it("accepts successful OAuth and provider responses across the 2xx range", () => {
    const serverIntegration = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/portalGoogleCalendar.ts"),
      "utf8",
    );

    expect(serverIntegration).toContain("if (!response.ok)");
    expect(serverIntegration).not.toMatch(
      /response\.status\s*(?:===|==|!==|!=)\s*(?:200|201)/,
    );
  });
});
