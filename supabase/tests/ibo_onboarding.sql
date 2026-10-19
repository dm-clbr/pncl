-- Run only against an isolated test database with the migration installed.
begin;
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000101', '{"full_name":"IBO Test","completed_portal_todos":{"surelc_tutorial_ibo":true}}'),
 ('00000000-0000-4000-8000-000000000102', '{}');
insert into public.portal_profiles (user_id) values
 ('00000000-0000-4000-8000-000000000101'), ('00000000-0000-4000-8000-000000000102');

do $$
declare first_id uuid; retry_id uuid;
begin
  assert not has_function_privilege('anon', 'public.submit_portal_new_producer(uuid,text)', 'execute');
  assert not has_function_privilege('authenticated', 'public.submit_portal_new_producer(uuid,text)', 'execute');
  assert has_function_privilege('service_role', 'public.submit_portal_new_producer(uuid,text)', 'execute');
  assert (select relrowsecurity from pg_class where oid='public.portal_tickets'::regclass);
  first_id := public.submit_portal_new_producer('00000000-0000-4000-8000-000000000101', 'IBO test submission');
  retry_id := public.submit_portal_new_producer('00000000-0000-4000-8000-000000000101', 'Retry');
  assert first_id = retry_id, 'Retry must reuse the ticket';
  assert (select count(*) = 1 from public.portal_tickets where user_id='00000000-0000-4000-8000-000000000101');
  assert (select raw_user_meta_data->>'full_name' = 'IBO Test' from auth.users where id='00000000-0000-4000-8000-000000000101');
  assert (select raw_user_meta_data->'completed_portal_todos' = '{"surelc_tutorial_ibo":true}'::jsonb from auth.users where id='00000000-0000-4000-8000-000000000101');
  assert (select auto_key='new_producer' and completion_type='auto' from public.portal_todos where slug='submit_new_producer');
  assert (select description not like '%Mutual of Omaha%' and description not ilike '%Transamerica%' from public.portal_todos where slug='surelc_account_1');
  assert (select description like '%Mutual of Omaha%' and description ilike '%Transamerica%' from public.portal_todos where slug='surelc_account_3');
end $$;

-- A ticket write failure must leave no completion record.
create function public.ibo_test_fail_update() returns trigger language plpgsql as $$
begin raise exception 'simulated ticket write failure'; end $$;
create trigger ibo_test_fail_update before insert on public.portal_tickets
for each row when (new.user_id='00000000-0000-4000-8000-000000000102') execute function public.ibo_test_fail_update();
do $$
begin
  begin
    perform public.submit_portal_new_producer('00000000-0000-4000-8000-000000000102', 'Must roll back');
    raise exception 'Expected failure did not occur';
  exception when others then
    if sqlerrm <> 'simulated ticket write failure' then raise; end if;
  end;
  assert not exists (select 1 from public.portal_tickets where user_id='00000000-0000-4000-8000-000000000102');
end $$;
rollback;
