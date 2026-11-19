begin;
create table public.google_capacity_monitor (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 account_limit integer not null check(account_limit>0),
 limit_source text not null default 'Admin-confirmed Google account cap',
 next_check_at timestamptz not null default now(),
 last_checked_at timestamptz,
 used_count integer check(used_count>=0),
 remaining integer,
 cycle_id uuid not null default gen_random_uuid(),
 warned_10 boolean not null default false,
 warned_5 boolean not null default false,
 last_error text
);
-- The user confirmed this limit after Google's increase on 2026-11-19.
insert into public.google_capacity_monitor(id,account_limit) values(true,400);
create table public.google_capacity_alerts (
 id uuid primary key default gen_random_uuid(),
 cycle_id uuid not null,
 threshold integer not null check(threshold in (10,5)),
 account_limit integer not null check(account_limit>0),
 used_count integer not null check(used_count>=0),
 remaining integer not null,
 observed_at timestamptz not null,
 created_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),
 sent_at timestamptz,
 cancelled_at timestamptz,
 attempts integer not null default 0,
 last_error text,
 unique(cycle_id,threshold)
);
create index google_capacity_alerts_due on public.google_capacity_alerts(next_attempt_at) where sent_at is null and cancelled_at is null;
alter table public.google_capacity_monitor enable row level security;
alter table public.google_capacity_alerts enable row level security;
revoke all on public.google_capacity_monitor,public.google_capacity_alerts from public,anon,authenticated;
grant all on public.google_capacity_monitor,public.google_capacity_alerts to service_role;

create function public.google_capacity_reset_limit() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.account_limit is distinct from old.account_limit then
  new.cycle_id:=gen_random_uuid(); new.warned_10:=false; new.warned_5:=false;
  new.next_check_at:=now(); new.last_checked_at:=null; new.used_count:=null; new.remaining:=null;
  update public.google_capacity_alerts set cancelled_at=now() where sent_at is null and cancelled_at is null;
 end if;
 return new;
end $$;
revoke all on function public.google_capacity_reset_limit() from public,anon,authenticated;
grant execute on function public.google_capacity_reset_limit() to service_role;
create trigger google_capacity_limit_updated before update of account_limit on public.google_capacity_monitor
 for each row execute function public.google_capacity_reset_limit();

create function public.google_capacity_record_count(p_used integer,p_limit integer,p_observed_at timestamptz,p_lease_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare cfg public.google_capacity_monitor%rowtype; available integer; alert_threshold integer;
begin
 if p_used is null or p_used<0 or p_limit is null or p_observed_at is null or p_observed_at>now()+interval '1 minute' then
  raise exception 'Invalid capacity observation';
 end if;
 if not exists(select 1 from public.onboarding_capacity_worker_state where id and enabled and lease_token=p_lease_token and lease_until>now()) then return false; end if;
 select * into cfg from public.google_capacity_monitor where id for update;
 if not cfg.enabled or cfg.account_limit<>p_limit or (cfg.last_checked_at is not null and p_observed_at<=cfg.last_checked_at) then return false; end if;
 available:=p_limit-p_used;
 if available>10 then
  if cfg.warned_10 or cfg.warned_5 then cfg.cycle_id:=gen_random_uuid(); end if;
  cfg.warned_10:=false; cfg.warned_5:=false;
  update public.google_capacity_alerts set cancelled_at=now() where sent_at is null and cancelled_at is null;
 elsif available<=5 and not cfg.warned_5 then
  alert_threshold:=5; cfg.warned_5:=true; cfg.warned_10:=true;
  -- If both thresholds were crossed between checks, send the urgent alert only.
  update public.google_capacity_alerts set cancelled_at=now() where sent_at is null and cancelled_at is null and threshold=10;
 elsif available<=10 and not cfg.warned_10 then
  alert_threshold:=10; cfg.warned_10:=true;
 end if;
 update public.google_capacity_monitor set used_count=p_used,remaining=available,last_checked_at=p_observed_at,
  next_check_at=now()+interval '5 minutes',last_error=null,cycle_id=cfg.cycle_id,warned_10=cfg.warned_10,warned_5=cfg.warned_5 where id;
 if alert_threshold is not null then
  insert into public.google_capacity_alerts(cycle_id,threshold,account_limit,used_count,remaining,observed_at)
   values(cfg.cycle_id,alert_threshold,p_limit,p_used,available,p_observed_at) on conflict do nothing;
 end if;
 return true;
end $$;
revoke all on function public.google_capacity_record_count(integer,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.google_capacity_record_count(integer,integer,timestamptz,uuid) to service_role;

create or replace function public.onboarding_capacity_dispatch(p_force boolean default false) returns bigint
language plpgsql security invoker set search_path='' as $$
declare token uuid:=gen_random_uuid(); request_id bigint;
begin
  delete from public.onboarding_capacity_wake_tokens where expires_at<now();
  if not exists(select 1 from public.onboarding_capacity_worker_state where id and enabled and (lease_until is null or lease_until<now())) then return null; end if;
  if not p_force and not exists(
    select 1 from public.onboarding_records where capacity_wait_started_at is not null and capacity_recovered_at is null and released_at is null
      and enrollment_status in ('waiting_google_capacity','provisioning_google','provisioning_portal','finalizing') and capacity_next_retry_at<=now()
      and (provisioning_lock_expires_at is null or provisioning_lock_expires_at<now())
  ) and not exists(select 1 from public.onboarding_capacity_notifications where sent_at is null and next_attempt_at<=now()) and not exists(select 1 from public.google_capacity_monitor where id and enabled and next_check_at<=now())
    and not exists(select 1 from public.google_capacity_alerts a join public.google_capacity_monitor m on m.id and m.enabled and m.cycle_id=a.cycle_id
      where a.sent_at is null and a.cancelled_at is null and a.next_attempt_at<=now()) then return null; end if;
  insert into public.onboarding_capacity_wake_tokens values(encode(sha256(convert_to(token::text,'UTF8')),'hex'),now()+interval '2 minutes');
  select net.http_post(
    url:='https://dpnajpojbxgsckwrmvnm.supabase.co/functions/v1/onboarding-capacity-worker',
    headers:=jsonb_build_object('Content-Type','application/json','x-onboarding-capacity-wake',token::text),
    body:='{}'::jsonb,timeout_milliseconds:=10000) into request_id;
  return request_id;
end;
$$;

commit;
