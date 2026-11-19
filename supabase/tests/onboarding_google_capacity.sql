-- Run against an isolated PostgreSQL database, never against production.
\set ON_ERROR_STOP on
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create table public.onboarding_records (
 id uuid primary key default gen_random_uuid(),
 enrollment_status text constraint onboarding_records_enrollment_status_check check(enrollment_status in ('application_saved','ready','needs_attention')),
 google_account_status text constraint onboarding_records_google_account_status_check check(google_account_status in ('pending','ready','failed')),
 released_at timestamptz, provisioning_lock_expires_at timestamptz,
 google_user_id text,supabase_user_id uuid, provisioning_lock_token uuid
);
alter table public.onboarding_records enable row level security;
grant all on public.onboarding_records to service_role;
create schema net;
create table net.test_requests(id bigint generated always as identity,headers jsonb);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
declare result bigint;
begin insert into net.test_requests(headers) values(headers) returning id into result; return result; end $$;
\ir ../migrations/20261119231505_onboarding_google_capacity_queue.sql
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; raise notice 'PASS: %',message; end $$;
select pg_temp.assert((select not enabled from onboarding_capacity_worker_state),'worker initially disabled');
select pg_temp.assert(onboarding_capacity_dispatch(true) is null,'disabled worker cannot be dispatched');
select pg_temp.assert((select count(*)=3 and bool_and(relrowsecurity) from pg_class where relname in ('onboarding_capacity_notifications','onboarding_capacity_worker_state','onboarding_capacity_wake_tokens')),'all queue tables have RLS');
select pg_temp.assert(not has_table_privilege('anon','onboarding_capacity_wake_tokens','SELECT') and not has_table_privilege('authenticated','onboarding_capacity_notifications','SELECT'),'queue and tokens inaccessible to clients');
select pg_temp.assert(not has_function_privilege('anon','onboarding_capacity_claim_wake(uuid)','EXECUTE') and not has_function_privilege('authenticated','onboarding_capacity_dispatch(boolean)','EXECUTE'),'worker RPCs inaccessible to clients');
insert into onboarding_records(id,enrollment_status,google_account_status,capacity_wait_started_at,capacity_next_retry_at)
 values('00000000-0000-4000-8000-000000000001','waiting_google_capacity','waiting_capacity',now(),now());
select pg_temp.assert((select count(*)=1 from onboarding_capacity_notifications where event='waiting'),'waiting state atomically queues an alert');
update onboarding_records set enrollment_status='provisioning_google';
update onboarding_records set enrollment_status='waiting_google_capacity';
select pg_temp.assert((select count(*)=1 from onboarding_capacity_notifications),'retries do not duplicate alerts');
update onboarding_capacity_worker_state set enabled=true;
select pg_temp.assert(onboarding_capacity_dispatch()=1,'due enrollment wakes worker');
create temp table tokens as select (headers->>'x-onboarding-capacity-wake')::uuid as token from net.test_requests where id=1;
select pg_temp.assert(onboarding_capacity_claim_wake((select token from tokens)),'valid one-use token claims lease');
select pg_temp.assert(not onboarding_capacity_claim_wake((select token from tokens)),'replayed token rejected');
select pg_temp.assert(onboarding_capacity_dispatch(true) is null,'concurrent dispatcher blocked by lease');
insert into onboarding_capacity_wake_tokens values(encode(sha256(convert_to('00000000-0000-4000-8000-000000000002','UTF8')),'hex'),now()+interval '1 minute');
select pg_temp.assert(not onboarding_capacity_claim_wake('00000000-0000-4000-8000-000000000002'),'second valid token cannot overlap active worker');
update onboarding_capacity_worker_state set lease_token=null,lease_until=null;
insert into onboarding_capacity_wake_tokens values(encode(sha256(convert_to('00000000-0000-4000-8000-000000000003','UTF8')),'hex'),now()-interval '1 minute');
select pg_temp.assert(not onboarding_capacity_claim_wake('00000000-0000-4000-8000-000000000003'),'expired token rejected');
update onboarding_records set enrollment_status='awaiting_google_sign_in',google_account_status='ready',capacity_recovered_at=now(),capacity_next_retry_at=null;
select pg_temp.assert((select count(*)=1 from onboarding_capacity_notifications where event='ready'),'recovery atomically queues ready alert');
update onboarding_records set enrollment_status='ready';
select pg_temp.assert((select count(*)=1 from onboarding_capacity_notifications where event='ready'),'agent sign-in does not duplicate ready alert');
update onboarding_capacity_notifications set sent_at=now();
select pg_temp.assert(onboarding_capacity_dispatch() is null,'empty queue does not invoke worker');
update onboarding_records set enrollment_status='needs_attention';
select pg_temp.assert((select count(*)=1 from onboarding_capacity_notifications where event='attention'),'different failure queues admin intervention alert');
update onboarding_capacity_notifications set sent_at=now();
update onboarding_records set enrollment_status='waiting_google_capacity',capacity_recovered_at=null,capacity_next_retry_at=now(),released_at=now();
select pg_temp.assert(onboarding_capacity_dispatch() is null,'released enrollment never automatically retried');
update onboarding_records set released_at=null,capacity_next_retry_at=now()+interval '5 minutes';
select pg_temp.assert(onboarding_capacity_dispatch() is null,'future retry is not run early');
update onboarding_records set capacity_next_retry_at=now(),provisioning_lock_expires_at=now()+interval '5 minutes';
select pg_temp.assert(onboarding_capacity_dispatch() is null,'manual provisioning lock prevents automatic retry');
update onboarding_records set provisioning_lock_expires_at=now()-interval '1 minute';
select pg_temp.assert(onboarding_capacity_dispatch() is not null,'expired provisioning lock can recover');
update onboarding_records set provisioning_lock_token='00000000-0000-4000-8000-000000000004';
with stale as (update onboarding_records set enrollment_status='needs_attention' where provisioning_lock_token='00000000-0000-4000-8000-000000000005' returning id)
 select pg_temp.assert((select count(*)=0 from stale),'stale worker cannot overwrite newer provisioning lock');
select pg_temp.assert(has_function_privilege('service_role','onboarding_capacity_claim_wake(uuid)','EXECUTE'),'service role can claim worker wake');
select pg_temp.assert(not has_function_privilege('service_role','onboarding_capacity_dispatch(boolean)','EXECUTE'),'worker cannot mint its own wake tokens');
select pg_temp.assert((select count(*)=0 from onboarding_capacity_wake_tokens where expires_at<now()),'dispatcher cleans expired tokens');

update onboarding_records set provisioning_lock_expires_at=now()+interval '5 minutes';
with attempted as (update onboarding_records set released_at=now() where google_user_id is null and supabase_user_id is null
 and (provisioning_lock_expires_at is null or provisioning_lock_expires_at<now()) returning id)
 select pg_temp.assert((select count(*)=0 from attempted),'admin release cannot race a running retry');
