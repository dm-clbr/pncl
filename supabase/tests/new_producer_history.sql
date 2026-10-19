-- Run only against an isolated test database, never production.
begin;
insert into auth.users(id,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000104','{"completed_portal_todos":{"submit_new_producer":true}}'),
 ('00000000-0000-4000-8000-000000000105','{}'),
 ('00000000-0000-4000-8000-000000000106','{}');
insert into public.portal_profiles(user_id,new_producer_notification_sent_at) values
 ('00000000-0000-4000-8000-000000000104',null),
 ('00000000-0000-4000-8000-000000000105',now()),
 ('00000000-0000-4000-8000-000000000106',null);
\ir ../migrations/20261019200015_preserve_new_producer_completion_history.sql
update auth.users set raw_user_meta_data='{"completed_portal_todos":{"submit_new_producer":true}}'
 where id='00000000-0000-4000-8000-000000000106';
do $$
begin
  assert exists(select 1 from public.portal_new_producer_legacy_completions where user_id='00000000-0000-4000-8000-000000000104');
  assert exists(select 1 from public.portal_new_producer_legacy_completions where user_id='00000000-0000-4000-8000-000000000105');
  assert not exists(select 1 from public.portal_new_producer_legacy_completions where user_id='00000000-0000-4000-8000-000000000106');
  assert not has_table_privilege('anon','public.portal_new_producer_legacy_completions','select');
  assert not has_table_privilege('authenticated','public.portal_new_producer_legacy_completions','insert');
  assert not has_table_privilege('service_role','public.portal_new_producer_legacy_completions','insert');
  assert has_table_privilege('service_role','public.portal_new_producer_legacy_completions','select');
  assert (select relrowsecurity from pg_class where oid='public.portal_new_producer_legacy_completions'::regclass);
end $$;
rollback;
