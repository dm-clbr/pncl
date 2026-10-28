begin;
create schema hub_auth_private;
revoke all on schema hub_auth_private from public, anon, authenticated, service_role;
create table hub_auth_private.email_change_permits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  permit_id uuid not null default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  onboarding_id uuid,
  from_email text not null,
  to_email text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index hub_email_permits_admin_idx on hub_auth_private.email_change_permits(admin_id);
create table hub_auth_private.email_change_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null, admin_id uuid not null, permit_id uuid not null,
  previous_email text not null, next_email text not null,
  changed_at timestamptz not null default clock_timestamp()
);
alter table hub_auth_private.email_change_permits enable row level security;
alter table hub_auth_private.email_change_audit enable row level security;
revoke all on all tables in schema hub_auth_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema hub_auth_private from public, anon, authenticated, service_role;

-- The caller is the real user JWT, never a browser-supplied actor or service JWT.
create function hub_auth_private.prepare_email_change(p_user_id uuid,p_expected_email text,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  u auth.users%rowtype;
  target text := lower(trim(p_email));
  onboarding uuid;
  matches integer;
  permit uuid;
begin
  if actor is null or not exists(select 1 from auth.users a where a.id=actor
    and a.raw_app_meta_data->>'role'='admin' and a.email_confirmed_at is not null
    and a.email ~* '^[^[:space:]@]+@thepncl[.]com$' and a.deleted_at is null
    and (a.banned_until is null or a.banned_until<=clock_timestamp())) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if target is null or length(target)>254 or target !~ '^[^[:space:]@]+@thepncl[.]com$' then
    raise exception 'invalid_email' using errcode='22023';
  end if;
  select * into u from auth.users where id=p_user_id for update;
  if not found or u.deleted_at is not null or u.email !~* '^[^[:space:]@]+@thepncl[.]com$' then
    raise exception 'account_unavailable';
  end if;
  if lower(u.email) is distinct from lower(trim(p_expected_email)) then raise exception 'email_changed'; end if;
  if lower(u.email)=target then return jsonb_build_object('complete',true); end if;
  if coalesce(u.email_change,'')<>'' then raise exception 'pending_email_change'; end if;
  if exists(select 1 from auth.users where id<>u.id and lower(email)=target)
    or exists(select 1 from auth.identities where user_id<>u.id and lower(identity_data->>'email')=target)
    or exists(select 1 from public.onboarding_records where lower(workspace_email)=target
      and supabase_user_id is distinct from u.id and released_at is null) then raise exception 'email_taken'; end if;
  -- A single authoritative onboarding record must agree with the old identity.
  select count(*),(array_agg(id))[1] into matches,onboarding from public.onboarding_records
    where released_at is null and (supabase_user_id=u.id
      or (supabase_user_id is null and (id::text=u.raw_app_meta_data->>'onboarding_id' or lower(workspace_email)=lower(u.email))));
  if matches>1 then raise exception 'onboarding_review_required'; end if;
  if onboarding is not null and not exists(select 1 from public.onboarding_records
    where id=onboarding and lower(workspace_email)=lower(u.email)) then raise exception 'onboarding_review_required'; end if;
  if exists(select 1 from hub_auth_private.email_change_permits where user_id=u.id
    and created_at>clock_timestamp()-interval '1 minute') then raise exception 'email_change_cooldown'; end if;
  insert into hub_auth_private.email_change_permits(user_id,admin_id,onboarding_id,from_email,to_email,expires_at)
    values(u.id,actor,onboarding,lower(u.email),target,clock_timestamp()+interval '60 seconds')
    on conflict(user_id) do update set permit_id=gen_random_uuid(),admin_id=excluded.admin_id,
      onboarding_id=excluded.onboarding_id,from_email=excluded.from_email,to_email=excluded.to_email,
      created_at=clock_timestamp(),expires_at=excluded.expires_at,consumed_at=null
    returning permit_id into permit;
  return jsonb_build_object('complete',false,'permitId',permit);
end $$;
revoke all on function hub_auth_private.prepare_email_change(uuid,text,text) from public,anon,authenticated,service_role;
grant usage on schema hub_auth_private to authenticated;
grant execute on function hub_auth_private.prepare_email_change(uuid,text,text) to authenticated;
create function public.prepare_hub_work_email_change(p_user_id uuid,p_expected_email text,p_email text)
returns jsonb language sql security invoker set search_path='' as $$
  select hub_auth_private.prepare_email_change(p_user_id,p_expected_email,p_email);
$$;
revoke all on function public.prepare_hub_work_email_change(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_hub_work_email_change(uuid,text,text) to authenticated;

create function hub_auth_private.cancel_email_change(p_user_id uuid,p_permit_id uuid)
returns void language sql security definer set search_path='' as $$
  update hub_auth_private.email_change_permits set expires_at=clock_timestamp()
    where user_id=p_user_id and permit_id=p_permit_id and admin_id=auth.uid() and consumed_at is null;
$$;
revoke all on function hub_auth_private.cancel_email_change(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function hub_auth_private.cancel_email_change(uuid,uuid) to authenticated;
create function public.cancel_hub_work_email_change(p_user_id uuid,p_permit_id uuid)
returns void language sql security invoker set search_path='' as $$
  select hub_auth_private.cancel_email_change(p_user_id,p_permit_id);
$$;
revoke all on function public.cancel_hub_work_email_change(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cancel_hub_work_email_change(uuid,uuid) to authenticated;

create function hub_auth_private.guard_user_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare p hub_auth_private.email_change_permits%rowtype;
begin
  -- Email-neutral profile updates, ordinary logins and token clearing still work.
  if lower(coalesce(new.email,''))=lower(coalesce(old.email,''))
    and (new.email_change is not distinct from old.email_change or coalesce(new.email_change,'')='') then return new; end if;
  if lower(coalesce(new.email,''))=lower(coalesce(old.email,'')) or coalesce(new.email_change,'')<>'' then
    raise exception 'Hub work email is managed by an administrator' using errcode='42501';
  end if;
  select * into p from hub_auth_private.email_change_permits a
    where a.user_id=old.id and a.from_email=lower(old.email) and a.to_email=lower(new.email)
      and a.expires_at>clock_timestamp() and a.consumed_at is null
      and exists(select 1 from auth.users actor where actor.id=a.admin_id
        and actor.raw_app_meta_data->>'role'='admin' and actor.email_confirmed_at is not null
        and actor.email ~* '^[^[:space:]@]+@thepncl[.]com$' and actor.deleted_at is null
        and (actor.banned_until is null or actor.banned_until<=clock_timestamp())) for update;
  if not found then raise exception 'Hub work email is managed by an administrator' using errcode='42501'; end if;
  if p.onboarding_id is not null then
    update public.onboarding_records set workspace_email=new.email,supabase_user_id=old.id
      where id=p.onboarding_id and released_at is null and lower(workspace_email)=lower(old.email)
        and (supabase_user_id is null or supabase_user_id=old.id);
    if not found then raise exception 'onboarding_review_required'; end if;
  end if;
  update hub_auth_private.email_change_permits set consumed_at=clock_timestamp() where user_id=old.id;
  insert into hub_auth_private.email_change_audit(user_id,admin_id,permit_id,previous_email,next_email)
    values(old.id,p.admin_id,p.permit_id,old.email,new.email);
  return new;
end $$;
revoke all on function hub_auth_private.guard_user_email() from public,anon,authenticated,service_role;
create trigger hub_guard_user_email before update of email,email_change on auth.users
  for each row execute function hub_auth_private.guard_user_email();

-- Auth Admin updates the email identity before auth.users in the same transaction.
-- OAuth may refresh identity metadata, but cannot introduce a different email.
create function hub_auth_private.guard_identity_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare current_email text; incoming text:=lower(coalesce(new.identity_data->>'email',''));
begin
  if tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id or new.provider is distinct from old.provider or new.provider_id is distinct from old.provider_id then
      raise exception 'Hub identity ownership is immutable' using errcode='42501';
    end if;
    if incoming=lower(coalesce(old.identity_data->>'email','')) then return new; end if;
  end if;
  select lower(email) into current_email from auth.users where id=new.user_id;
  if incoming=current_email then return new; end if;
  if not exists(select 1 from hub_auth_private.email_change_permits p
    join auth.users actor on actor.id=p.admin_id
    where p.user_id=new.user_id and p.from_email=current_email and p.to_email=incoming
      and p.expires_at>clock_timestamp() and p.consumed_at is null
      and actor.raw_app_meta_data->>'role'='admin' and actor.email_confirmed_at is not null
      and actor.email ~* '^[^[:space:]@]+@thepncl[.]com$' and actor.deleted_at is null
      and (actor.banned_until is null or actor.banned_until<=clock_timestamp())) then
    raise exception 'Hub work email is managed by an administrator' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function hub_auth_private.guard_identity_email() from public,anon,authenticated,service_role;
create trigger hub_guard_identity_email before insert or update of user_id,provider,provider_id,identity_data on auth.identities
  for each row execute function hub_auth_private.guard_identity_email();
commit;
