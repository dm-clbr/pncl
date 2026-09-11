alter table public.portal_profiles
  add column if not exists recovery_email text,
  add column if not exists recovery_email_sync_status text,
  add column if not exists recovery_email_last_synced_at timestamptz,
  add column if not exists recovery_email_last_sync_error text;

-- `dm@thepncl.com` was a legacy placeholder, not an agent-owned recovery
-- address. Clear it (and any Workspace-domain value) from the agent-facing
-- profile so the required profile field prompts for an explicit replacement.
-- Do not rewrite signed ICA history or infer a replacement from other data.
update public.portal_profiles
set recovery_email = null,
    recovery_email_sync_status = null,
    recovery_email_last_synced_at = null,
    recovery_email_last_sync_error = null
where recovery_email is not null
  and lower(btrim(recovery_email)) ~ '@thepncl\.com$';

alter table public.portal_profiles
  drop constraint if exists portal_profiles_recovery_email_valid;

alter table public.portal_profiles
  add constraint portal_profiles_recovery_email_valid
  check (
    recovery_email is null
    or (
      recovery_email = lower(btrim(recovery_email))
      and recovery_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and recovery_email !~* '@thepncl\.com$'
    )
  ) not valid;

alter table public.portal_profiles
  validate constraint portal_profiles_recovery_email_valid;

alter table public.portal_profiles
  drop constraint if exists portal_profiles_recovery_email_sync_status_valid;

alter table public.portal_profiles
  add constraint portal_profiles_recovery_email_sync_status_valid
  check (recovery_email_sync_status is null or recovery_email_sync_status in ('pending', 'synced', 'error'))
  not valid;

alter table public.portal_profiles
  validate constraint portal_profiles_recovery_email_sync_status_valid;

-- Backfill only addresses that were explicitly collected in a signed ICA.
-- Leave unknown or workspace-domain values blank so agents complete them
-- themselves; this migration never infers a personal address.
with latest_onboarding as (
  select distinct on (supabase_user_id)
    supabase_user_id,
    lower(btrim(personal_email)) as recovery_email
  from public.onboarding_records
  where supabase_user_id is not null
    and personal_email is not null
    and lower(btrim(personal_email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and lower(btrim(personal_email)) !~ '@thepncl\.com$'
  order by supabase_user_id, created_at desc
)
update public.portal_profiles as profile
set recovery_email = onboarding.recovery_email,
    recovery_email_sync_status = coalesce(profile.recovery_email_sync_status, 'pending'),
    recovery_email_last_sync_error = null
from latest_onboarding as onboarding
where profile.user_id::text = onboarding.supabase_user_id
  and profile.recovery_email is null;

with portal_ica as (
  select
    user_id,
    lower(btrim(personal_email)) as recovery_email
  from public.portal_ica_signatures
  where personal_email is not null
    and lower(btrim(personal_email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and lower(btrim(personal_email)) !~ '@thepncl\.com$'
)
update public.portal_profiles as profile
set recovery_email = ica.recovery_email,
    recovery_email_sync_status = coalesce(profile.recovery_email_sync_status, 'pending'),
    recovery_email_last_sync_error = null
from portal_ica as ica
where profile.user_id = ica.user_id
  and profile.recovery_email is null;

comment on column public.portal_profiles.recovery_email is
  'Agent-owned personal email used as the recovery address for the corresponding PNCL Google Workspace account.';
comment on column public.portal_profiles.recovery_email_sync_status is
  'Google Workspace recovery sync state. Legacy profiles without an explicitly collected personal address remain null until the agent supplies one.';

grant select, insert, update on table public.portal_profiles to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_class
    where oid = 'public.portal_profiles'::regclass and relrowsecurity
  ) then
    raise exception 'portal_profiles RLS must remain enabled';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_profiles'
      and policyname = 'Users can read own profile'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual like '%auth.uid()%user_id%'
  ) then
    raise exception 'portal_profiles own-profile SELECT policy is missing';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_profiles'
      and roles && array['anon', 'public']::name[]
  ) then
    raise exception 'portal_profiles must not expose rows to anon or public policies';
  end if;
end
$$;
