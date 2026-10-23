-- Run only against an isolated test database with the migration installed.
begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000201');

do $$
declare
  asset jsonb := jsonb_build_object(
    'id', '00000000-0000-4000-8000-000000000202', 'designation', 'ibo', 'kind', 'welcome_video',
    'path', 'ibo/welcome_video/test.mp4', 'filename', 'test.mp4', 'content_type', 'video/mp4',
    'size_bytes', 100, 'sha256', repeat('a',64), 'created_by', '00000000-0000-4000-8000-000000000201');
begin
  assert not has_function_privilege('anon', 'public.publish_onboarding_content(jsonb,text)', 'execute');
  assert not has_function_privilege('authenticated', 'public.publish_onboarding_content(jsonb,text)', 'execute');
  assert has_function_privilege('service_role', 'public.publish_onboarding_content(jsonb,text)', 'execute');
  assert not has_table_privilege('authenticated', 'public.onboarding_flow_content', 'update');
  assert not has_table_privilege('anon', 'public.onboarding_content_assets', 'insert');
  assert (select relrowsecurity from pg_class where oid='public.onboarding_content_assets'::regclass);
  assert (select relrowsecurity from pg_class where oid='public.onboarding_flow_content'::regclass);
  assert (select relrowsecurity from pg_class where oid='public.onboarding_contract_signatures'::regclass);
  assert not has_table_privilege('anon', 'public.onboarding_contract_signatures', 'select');
  assert not has_table_privilege('authenticated', 'public.onboarding_contract_signatures', 'insert');
  assert has_table_privilege('service_role', 'public.onboarding_contract_signatures', 'select,insert,update');

  perform public.publish_onboarding_content(asset, 'https://example.invalid/ibo.mp4');
  assert (select welcome_video_asset_id = '00000000-0000-4000-8000-000000000202' from public.onboarding_flow_content where designation='ibo');
  assert (select welcome_video_asset_id is null and ica_asset_id is null and surelc_video_asset_id is null from public.onboarding_flow_content where designation='loa');
  assert (select published and show_ibo and not show_loa and href='https://example.invalid/ibo.mp4' from public.portal_todos where slug='onboarding_welcome_ibo');
  assert (select not published from public.portal_todos where slug='onboarding_welcome_loa');

  asset := asset || '{"id":"00000000-0000-4000-8000-000000000203","path":"ibo/welcome_video/replacement.mp4"}'::jsonb;
  perform public.publish_onboarding_content(asset, 'https://example.invalid/replacement.mp4');
  assert (select welcome_video_asset_id = '00000000-0000-4000-8000-000000000203' from public.onboarding_flow_content where designation='ibo');
  assert exists (select 1 from public.onboarding_content_assets where id='00000000-0000-4000-8000-000000000202'), 'Previous source files must be retained';

  asset := asset || '{"id":"00000000-0000-4000-8000-000000000204","path":"ibo/welcome_video/failed.mp4"}'::jsonb;
  begin
    perform public.publish_onboarding_content(asset, null);
    raise exception 'Expected publication failure';
  exception when others then
    if sqlerrm <> 'Video URL required' then raise; end if;
  end;
  assert not exists (select 1 from public.onboarding_content_assets where id='00000000-0000-4000-8000-000000000204');
  assert (select welcome_video_asset_id = '00000000-0000-4000-8000-000000000203' from public.onboarding_flow_content where designation='ibo'), 'Publication failure must roll back the active pointer';
end $$;
rollback;
