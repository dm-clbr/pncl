-- User-scoped Google Calendar connections and a deliberately small preview cache.
-- OAuth tokens remain server-only; authenticated clients receive only their own
-- connection metadata and cached event title/time fields.

create table if not exists public.portal_google_calendar_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'connected',
  scope text not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  sync_window_end timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_google_calendar_connections_status_check
    check (status in ('connected', 'reauthorization_required')),
  constraint portal_google_calendar_connections_error_check
    check (last_error_code is null or last_error_code in ('sync_failed', 'authorization_expired'))
);

comment on table public.portal_google_calendar_connections is
  'Non-secret owner-scoped metadata for a portal user Google Calendar connection.';
comment on column public.portal_google_calendar_connections.scope is
  'The exact Google OAuth scope granted for this connection; expected to be calendar.events.readonly.';

create table if not exists public.portal_google_calendar_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_encrypted text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portal_google_calendar_credentials is
  'AES-GCM encrypted Google refresh tokens. Service-role Edge Functions only; never exposed to browser roles.';

create table if not exists public.portal_google_calendar_oauth_attempts (
  state_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_verifier_encrypted text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.portal_google_calendar_oauth_attempts is
  'Short-lived, one-time OAuth state and encrypted PKCE verifier records.';

create index if not exists portal_google_calendar_oauth_attempts_user_idx
  on public.portal_google_calendar_oauth_attempts (user_id);
create index if not exists portal_google_calendar_oauth_attempts_expires_idx
  on public.portal_google_calendar_oauth_attempts (expires_at);

create table if not exists public.portal_google_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date,
  is_all_day boolean not null default false,
  calendar_context text not null default 'Primary calendar',
  join_url text,
  cached_at timestamptz not null default now(),
  constraint portal_google_calendar_events_start_check check (
    (is_all_day and start_date is not null and starts_at is null)
    or (not is_all_day and starts_at is not null and start_date is null)
  ),
  constraint portal_google_calendar_events_end_check check (
    (is_all_day and end_date is not null and ends_at is null)
    or (not is_all_day and ends_at is not null and end_date is null)
  ),
  constraint portal_google_calendar_events_join_url_check check (
    join_url is null
    or (
      char_length(join_url) <= 2048
      and join_url ~ '^https://[^[:space:]]+$'
    )
  )
);

comment on table public.portal_google_calendar_events is
  'At most 10 upcoming primary-calendar events per user for a 14-day window. Stores only privacy-filtered title/time fields and one validated conference join URL.';

create index if not exists portal_google_calendar_events_user_time_idx
  on public.portal_google_calendar_events (user_id, starts_at, start_date);

drop trigger if exists portal_google_calendar_connections_updated_at
on public.portal_google_calendar_connections;
create trigger portal_google_calendar_connections_updated_at
before update on public.portal_google_calendar_connections
for each row execute function public.set_updated_at();

drop trigger if exists portal_google_calendar_credentials_updated_at
on public.portal_google_calendar_credentials;
create trigger portal_google_calendar_credentials_updated_at
before update on public.portal_google_calendar_credentials
for each row execute function public.set_updated_at();

alter table public.portal_google_calendar_connections enable row level security;
alter table public.portal_google_calendar_credentials enable row level security;
alter table public.portal_google_calendar_oauth_attempts enable row level security;
alter table public.portal_google_calendar_events enable row level security;

drop policy if exists "Users can read own Google Calendar connection"
on public.portal_google_calendar_connections;
create policy "Users can read own Google Calendar connection"
on public.portal_google_calendar_connections
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own Google Calendar preview"
on public.portal_google_calendar_events;
create policy "Users can read own Google Calendar preview"
on public.portal_google_calendar_events
for select to authenticated
using ((select auth.uid()) = user_id);

-- No anon/authenticated policies or grants exist for credential and OAuth-attempt
-- rows. The service role is used only after an Edge Function authenticates the
-- portal user (or validates and consumes a high-entropy callback state value).
revoke all on table public.portal_google_calendar_connections from anon, authenticated;
revoke all on table public.portal_google_calendar_credentials from anon, authenticated;
revoke all on table public.portal_google_calendar_oauth_attempts from anon, authenticated;
revoke all on table public.portal_google_calendar_events from anon, authenticated;

grant select (
  user_id, status, scope, connected_at, last_synced_at, sync_window_end,
  last_error_code, created_at, updated_at
) on table public.portal_google_calendar_connections to authenticated;
grant select (
  id, user_id, title, starts_at, ends_at, start_date, end_date,
  is_all_day, calendar_context, join_url, cached_at
) on table public.portal_google_calendar_events to authenticated;

grant select, insert, update, delete
on table public.portal_google_calendar_connections to service_role;
grant select, insert, update, delete
on table public.portal_google_calendar_credentials to service_role;
grant select, insert, update, delete
on table public.portal_google_calendar_oauth_attempts to service_role;
grant select, insert, update, delete
on table public.portal_google_calendar_events to service_role;
