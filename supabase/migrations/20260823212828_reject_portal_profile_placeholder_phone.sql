update public.portal_profiles
set phone_number = null
where phone_number = '000-000-0000';

alter table public.portal_profiles
  drop constraint if exists portal_profiles_phone_number_valid;

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

alter table public.portal_profiles
  validate constraint portal_profiles_phone_number_valid;

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
