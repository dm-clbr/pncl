alter table public.portal_profiles
  add column if not exists phone_number text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'portal_profiles_phone_number_valid'
      and conrelid = 'public.portal_profiles'::regclass
  ) then
    alter table public.portal_profiles
      add constraint portal_profiles_phone_number_valid
      check (
        phone_number is null
        or (
          phone_number ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$'
          and phone_number <> '000-000-0000'
        )
      )
      not valid;
  end if;
end
$$;

alter table public.portal_profiles
  validate constraint portal_profiles_phone_number_valid;

with latest_onboarding as (
  select distinct on (supabase_user_id)
    supabase_user_id,
    phone_number
  from public.onboarding_records
  where supabase_user_id is not null
    and phone_number ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$'
    and phone_number <> '000-000-0000'
  order by supabase_user_id, created_at desc
)
update public.portal_profiles as profile
set phone_number = onboarding.phone_number
from latest_onboarding as onboarding
where profile.user_id::text = onboarding.supabase_user_id
  and profile.phone_number is null;

comment on column public.portal_profiles.phone_number is
  'Agent-owned profile phone, initially copied from the matching onboarding record and used only for the agent PDF business card.';

grant select, insert, update on table public.portal_profiles to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_class
    where oid = 'public.portal_profiles'::regclass
      and relrowsecurity
  ) then
    raise exception 'portal_profiles RLS must remain enabled';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_profiles'
      and policyname = 'Users can read own profile'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual like '%auth.uid()%user_id%'
  ) then
    raise exception 'portal_profiles own-profile SELECT policy is missing';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_profiles'
      and policyname = 'Users can insert own profile'
      and cmd = 'INSERT'
      and roles = array['authenticated']::name[]
      and with_check like '%auth.uid()%user_id%'
  ) then
    raise exception 'portal_profiles own-profile INSERT policy is missing';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_profiles'
      and policyname = 'Users can update own profile'
      and cmd = 'UPDATE'
      and roles = array['authenticated']::name[]
      and qual like '%auth.uid()%user_id%'
      and with_check like '%auth.uid()%user_id%'
  ) then
    raise exception 'portal_profiles own-profile UPDATE policy is missing';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_profiles'
      and roles && array['anon', 'public']::name[]
  ) then
    raise exception 'portal_profiles must not expose rows to anon or public policies';
  end if;
end
$$;
