-- Run after onboarding_google_capacity.sql in an isolated test database.
\set ON_ERROR_STOP on
\ir ../migrations/20261119233357_google_low_capacity_alerts.sql
create or replace function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; raise notice 'PASS: %',message; end $$;
select pg_temp.assert((select not enabled and account_limit=400 from google_capacity_monitor),'monitor starts disabled with confirmed cap');
select pg_temp.assert(not has_table_privilege('anon','google_capacity_monitor','SELECT') and not has_table_privilege('authenticated','google_capacity_alerts','SELECT'),'counts and notifications are private');
select pg_temp.assert(not has_function_privilege('anon','google_capacity_record_count(integer,integer,timestamptz,uuid)','EXECUTE'),'clients cannot inject capacity counts');
update onboarding_capacity_worker_state set enabled=true,lease_token='00000000-0000-4000-8000-000000000010',lease_until=now()+interval '4 minutes';
update google_capacity_monitor set enabled=true;
create function pg_temp.observe(used integer) returns boolean language sql as $$
 select google_capacity_record_count(used,400,clock_timestamp(),'00000000-0000-4000-8000-000000000010'); $$;
select pg_temp.assert(pg_temp.observe(389),'accepts valid live observation');
select pg_temp.assert((select count(*)=0 from google_capacity_alerts),'11 remaining sends no alert');
select pg_temp.observe(390);
select pg_temp.assert((select count(*)=1 and min(threshold)=10 from google_capacity_alerts),'10 remaining queues first alert');
select pg_temp.observe(390); select pg_temp.observe(394);
select pg_temp.assert((select count(*)=1 from google_capacity_alerts),'repeated checks at 10 through 6 do not duplicate');
select pg_temp.observe(395);
select pg_temp.assert((select count(*)=1 from google_capacity_alerts where threshold=5 and cancelled_at is null),'5 remaining queues urgent alert');
select pg_temp.assert((select cancelled_at is not null from google_capacity_alerts where threshold=10),'urgent threshold supersedes undelivered warning');
select pg_temp.observe(400); select pg_temp.observe(402); select pg_temp.observe(394); select pg_temp.observe(395);
select pg_temp.assert((select count(*)=2 from google_capacity_alerts),'zero, over-cap and oscillating checks do not spam');
select pg_temp.assert(not google_capacity_record_count(10,400,now()-interval '1 day','00000000-0000-4000-8000-000000000010'),'stale observations ignored');
select pg_temp.assert(not google_capacity_record_count(390,400,clock_timestamp(),'00000000-0000-4000-8000-000000000099'),'stale worker lease rejected');
select pg_temp.observe(389);
select pg_temp.assert((select not warned_10 and not warned_5 from google_capacity_monitor),'recovery above 10 rearms thresholds');
select pg_temp.assert((select count(*)=0 from google_capacity_alerts where cancelled_at is null and sent_at is null),'recovered capacity cancels pending old alerts');
select pg_temp.observe(396);
select pg_temp.assert((select count(*)=3 from google_capacity_alerts),'jump from healthy to critical sends only one urgent alert');
update google_capacity_monitor set account_limit=500;
select pg_temp.assert((select remaining is null and used_count is null and not warned_5 from google_capacity_monitor),'cap change resets stale counts and re-arms');
select pg_temp.assert(not pg_temp.observe(399),'in-flight count for old cap cannot commit');
select pg_temp.assert((select count(*)=0 from google_capacity_alerts where cancelled_at is null),'cap change cancels stale alerts');
-- Monitoring wakes the scheduler with no applicants waiting.
update onboarding_records set released_at=now();
update onboarding_capacity_notifications set sent_at=now();
update onboarding_capacity_worker_state set lease_token=null,lease_until=null;
select pg_temp.assert(onboarding_capacity_dispatch() is not null,'periodic monitor wakes worker even when enrollment queue empty');
update google_capacity_monitor set next_check_at=now()+interval '5 minutes';
select pg_temp.assert(onboarding_capacity_dispatch() is null,'monitor respects next-check schedule');
