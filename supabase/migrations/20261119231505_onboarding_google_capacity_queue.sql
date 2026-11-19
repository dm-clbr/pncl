begin;
alter table public.onboarding_records
  add column capacity_wait_started_at timestamptz,
  add column capacity_next_retry_at timestamptz,
  add column capacity_recovered_at timestamptz,
  add column capacity_retry_attempts integer not null default 0;
alter table public.onboarding_records drop constraint onboarding_records_enrollment_status_check;
alter table public.onboarding_records add constraint onboarding_records_enrollment_status_check check
  (enrollment_status in ('saving_application','application_saved','provisioning_google','waiting_google_capacity','google_verification_required','provisioning_portal','finalizing','awaiting_google_sign_in','ready','needs_attention'));
alter table public.onboarding_records drop constraint onboarding_records_google_account_status_check;
alter table public.onboarding_records add constraint onboarding_records_google_account_status_check check
  (google_account_status in ('pending','provisioning','ready','waiting_capacity','verification_required','failed'));
create index onboarding_capacity_due on public.onboarding_records(capacity_next_retry_at,id)
  where capacity_wait_started_at is not null and capacity_recovered_at is null and released_at is null;

create table public.onboarding_capacity_notifications (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.onboarding_records(id) on delete cascade,
  event text not null check(event in ('waiting','ready','attention')),
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  unique(onboarding_id,event)
);
create index onboarding_capacity_notifications_due on public.onboarding_capacity_notifications(next_attempt_at) where sent_at is null;
alter table public.onboarding_capacity_notifications enable row level security;
revoke all on public.onboarding_capacity_notifications from public,anon,authenticated;
grant all on public.onboarding_capacity_notifications to service_role;

create function public.onboarding_capacity_enqueue_notification() returns trigger
language plpgsql security invoker set search_path='' as $$
declare kind text;
begin
  if new.capacity_wait_started_at is null then return new; end if;
  if new.enrollment_status='waiting_google_capacity' then kind:='waiting';
  elsif new.enrollment_status in ('awaiting_google_sign_in','ready') and new.capacity_recovered_at is not null then kind:='ready';
  elsif new.enrollment_status in ('needs_attention','google_verification_required') then kind:='attention';
  else return new; end if;
  insert into public.onboarding_capacity_notifications(onboarding_id,event) values(new.id,kind)
    on conflict(onboarding_id,event) do nothing;
  return new;
end;
$$;
revoke all on function public.onboarding_capacity_enqueue_notification() from public,anon,authenticated;
grant execute on function public.onboarding_capacity_enqueue_notification() to service_role;
create trigger onboarding_capacity_notification after insert or update of enrollment_status,capacity_wait_started_at,capacity_recovered_at
  on public.onboarding_records for each row execute function public.onboarding_capacity_enqueue_notification();

create table public.onboarding_capacity_worker_state (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  lease_token uuid,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text
);
insert into public.onboarding_capacity_worker_state(id) values(true);
alter table public.onboarding_capacity_worker_state enable row level security;
revoke all on public.onboarding_capacity_worker_state from public,anon,authenticated;
grant all on public.onboarding_capacity_worker_state to service_role;
create table public.onboarding_capacity_wake_tokens(token_hash text primary key,expires_at timestamptz not null);
alter table public.onboarding_capacity_wake_tokens enable row level security;
revoke all on public.onboarding_capacity_wake_tokens from public,anon,authenticated;
grant all on public.onboarding_capacity_wake_tokens to service_role;

-- A cron request carries a short-lived, one-use token, never an API key.
create function public.onboarding_capacity_claim_wake(p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  delete from public.onboarding_capacity_wake_tokens where token_hash=encode(sha256(convert_to(p_token::text,'UTF8')),'hex') and expires_at>now();
  if not found then return false; end if;
  update public.onboarding_capacity_worker_state set lease_token=p_token,lease_until=now()+interval '4 minutes',last_started_at=now()
    where id and enabled and (lease_until is null or lease_until<now());
  return found;
end;
$$;
create function public.onboarding_capacity_dispatch(p_force boolean default false) returns bigint
language plpgsql security invoker set search_path='' as $$
declare token uuid:=gen_random_uuid(); request_id bigint;
begin
  delete from public.onboarding_capacity_wake_tokens where expires_at<now();
  if not exists(select 1 from public.onboarding_capacity_worker_state where id and enabled and (lease_until is null or lease_until<now())) then return null; end if;
  if not p_force and not exists(
    select 1 from public.onboarding_records where capacity_wait_started_at is not null and capacity_recovered_at is null and released_at is null
      and enrollment_status in ('waiting_google_capacity','provisioning_google','provisioning_portal','finalizing') and capacity_next_retry_at<=now()
      and (provisioning_lock_expires_at is null or provisioning_lock_expires_at<now())
  ) and not exists(select 1 from public.onboarding_capacity_notifications where sent_at is null and next_attempt_at<=now()) then return null; end if;
  insert into public.onboarding_capacity_wake_tokens values(encode(sha256(convert_to(token::text,'UTF8')),'hex'),now()+interval '2 minutes');
  select net.http_post(
    url:='https://dpnajpojbxgsckwrmvnm.supabase.co/functions/v1/onboarding-capacity-worker',
    headers:=jsonb_build_object('Content-Type','application/json','x-onboarding-capacity-wake',token::text),
    body:='{}'::jsonb,timeout_milliseconds:=10000) into request_id;
  return request_id;
end;
$$;
revoke all on function public.onboarding_capacity_claim_wake(uuid),public.onboarding_capacity_dispatch(boolean) from public,anon,authenticated;
grant execute on function public.onboarding_capacity_claim_wake(uuid) to service_role;
revoke all on function public.onboarding_capacity_dispatch(boolean) from service_role;
-- Enable only after deployment and validation. Local tests can run without cron/net extensions.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') then
    perform cron.schedule('pncl-onboarding-capacity','* * * * *','select public.onboarding_capacity_dispatch();');
  end if;
end $$;
commit;
