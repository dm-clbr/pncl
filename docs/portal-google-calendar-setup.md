# PNCL Portal — Per-user Google Calendar Setup

This integration is separate from both existing Google integrations:

| Integration | Credential | Purpose |
| --- | --- | --- |
| Portal authentication | Supabase Google provider OAuth client | Sign an `@thepncl.com` user into PNCL |
| Workspace provisioning | Service account with domain-wide delegation | Create and inspect PNCL Workspace users |
| **Calendar preview** | **Dedicated OAuth 2.0 Web client** | Let each signed-in portal user explicitly connect their own primary calendar |

Use a dedicated Calendar OAuth client so its grant contains only the Calendar preview scope and can be revoked independently from portal sign-in.

## Google Cloud setup

1. In the chosen Google Cloud project, enable the **Google Calendar API**.
2. Configure the OAuth consent screen. Prefer **Internal** if every calendar account will be in the PNCL Workspace; otherwise use External, add test users during testing, and complete Google verification before a public launch if Google requires it.
3. Add exactly this sensitive, read-only scope:

   ```text
   https://www.googleapis.com/auth/calendar.events.readonly
   ```

   Do not add `calendar`, `calendar.events`, or any other write scope.
4. Create an **OAuth 2.0 Client ID → Web application** dedicated to the Calendar preview.
5. Add the production Edge Function callback as an authorized redirect URI:

   ```text
   https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/portal-google-calendar-callback
   ```

   For local Supabase testing, also add the exact URI emitted by the local stack, normally:

   ```text
   http://127.0.0.1:54321/functions/v1/portal-google-calendar-callback
   ```

Google requires the redirect URI to match exactly, including scheme, host, port, path, and trailing-slash behavior.

## Supabase secrets

The existing `CREDENTIAL_ENCRYPTION_KEY` is reused to encrypt Google refresh tokens and short-lived PKCE verifiers with AES-GCM. Set these values as Supabase Edge Function secrets, never as `VITE_` variables and never in source control:

```bash
supabase secrets set \
  GOOGLE_CALENDAR_CLIENT_ID='...apps.googleusercontent.com' \
  GOOGLE_CALENDAR_CLIENT_SECRET='GOCSPX-...' \
  GOOGLE_CALENDAR_REDIRECT_URI='https://<project-ref>.supabase.co/functions/v1/portal-google-calendar-callback' \
  PNCL_SITE_URL='https://<portal-domain>'
```

Required secrets:

| Secret | Requirement |
| --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` | Dedicated Web client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Dedicated Web client secret |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Exact registered callback URI |
| `PNCL_SITE_URL` | Trusted portal origin; callback always returns to `/portal/calendar` on this origin |
| `CREDENTIAL_ENCRYPTION_KEY` | Existing high-entropy key used by PNCL server-side AES-GCM encryption |

## Database and functions

Apply migration `20260824000000_portal_google_calendar.sql`, then deploy:

- `start-portal-google-calendar-oauth` (authenticated)
- `portal-google-calendar-callback` (public callback; protected by one-time state + PKCE)
- `get-portal-google-calendar` (authenticated)
- `sync-portal-google-calendar` (authenticated)
- `disconnect-portal-google-calendar` (authenticated)

Do not make the callback function JWT-protected: Google redirects the browser without a Supabase JWT. The implementation instead hashes a 256-bit state value, stores an encrypted PKCE verifier for 10 minutes, and atomically consumes that attempt before token exchange.

## Data retention and privacy

- Only the user who owns a connection can read its non-secret metadata or event cache under RLS.
- OAuth refresh tokens are AES-GCM encrypted in a table with no `anon` or `authenticated` grants/policies. Access tokens are used in memory and are not stored.
- OAuth attempt records expire after 10 minutes, are unusable after expiration, and expired attempts are purged when a new connection flow starts.
- Each refresh replaces the cache with at most **10** events from the user's **primary calendar** in the next **14 days**.
- Cached fields are limited to privacy-filtered title, start/end, all-day state, the label `Primary calendar`, and at most one validated HTTPS conference join URL.
- Events marked private or confidential are stored as `Private event`. Untitled events are stored as `Busy`.
- Join-link selection prefers Google Calendar's structured `conferenceData` video entry point. A structured URL must be public HTTPS without credentials or a nonstandard port.
- If no structured video entry exists, location and description are scanned only in memory for narrowly recognized HTTPS Meet, Zoom, Teams, Webex, Jitsi, or GoTo join URLs. The raw location/description and unrelated or unsafe links are discarded.
- PNCL does not retain Google event IDs, descriptions, attendees, organizers, locations, unrelated links, or calendar account email addresses.
- Disconnect attempts Google token revocation, then deletes the local token, OAuth attempts, connection metadata, and cached events even if Google cannot confirm revocation.
- Cached previews, including the single join URL, remain until they are replaced by refresh, deleted on disconnect/account deletion, or removed when authorization expires; only events inside the 14-day window at the most recent refresh are stored.
- The callback return path is server-configured; no user-supplied return URL is accepted.

## Manual verification

1. Sign into PNCL and open `/portal/calendar`.
2. Connect a Google account and confirm the consent screen requests only read access to Calendar events.
3. Confirm the page shows at most 10 events and private events read `Private event`.
4. Confirm events with structured Google Meet data show **Join**, and test one recognized Zoom/Teams URL in the event location or description.
5. Confirm ordinary HTTPS links, HTTP links, credential-bearing links, private-network hosts, and lookalike domains do not produce a Join button.
6. Use **Refresh** after adding a test event; confirm the cache is replaced.
7. Revoke the app in the Google Account, then refresh in PNCL; confirm the page changes to **authorization expired**.
8. Reconnect, then disconnect in PNCL; confirm the preview clears and the app is removed from Google Account connections (or the UI warns if Google could not confirm revocation).
9. Sign in as a different agent and confirm neither the first user's connection nor events are visible through the page or Data API.
