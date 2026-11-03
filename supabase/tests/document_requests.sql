-- Run after migrations in a disposable database. All fixture data rolls back.
begin;
insert into auth.users(id, email, created_at, raw_app_meta_data) values
 ('a0000000-0000-0000-0000-000000000001', 'docs-admin@thepncl.com', now() - interval '1 year', '{"role":"admin"}'),
 ('a0000000-0000-0000-0000-000000000002', 'docs-loa@thepncl.com', now() - interval '1 year', '{}'),
 ('a0000000-0000-0000-0000-000000000003', 'docs-ibo@thepncl.com', now() - interval '1 year', '{"role":"agent"}'),
 ('a0000000-0000-0000-0000-000000000004', 'docs-banned@thepncl.com', now(), '{}'),
 ('a0000000-0000-0000-0000-000000000005', 'docs-outside@example.invalid', now(), '{}');
update auth.users set banned_until = now() + interval '1 year' where id = 'a0000000-0000-0000-0000-000000000004';
insert into public.portal_profiles(user_id, first_name, last_name, address_state) values
 ('a0000000-0000-0000-0000-000000000002', 'Test', 'LOA', 'UT'),
 ('a0000000-0000-0000-0000-000000000003', 'Test', 'IBO', 'ID');
insert into public.portal_agent_designations(user_id, designation) values ('a0000000-0000-0000-0000-000000000003','ibo');
insert into public.portal_ica_signatures(user_id, legal_name, personal_email, signature_name, pdf_path) values
 ('a0000000-0000-0000-0000-000000000002','Test LOA','test@example.invalid','Test LOA','fixture.pdf');
do $$ declare filters jsonb := '{"designation":"all","search":"docs-","state":"","ica":"all","joinedBefore":"","joinedAfter":""}'; rows jsonb; begin
  rows := public.document_request_recipients(filters, 'thepncl.com');
  assert jsonb_array_length(rows) = 2, 'Only eligible portal agents are recipients';
  assert jsonb_array_length(public.document_request_recipients(filters || '{"designation":"ibo"}', 'thepncl.com')) = 1, 'IBO targeting';
  assert jsonb_array_length(public.document_request_recipients(filters || '{"state":"UT","ica":"signed"}', 'thepncl.com')) = 1, 'State and ICA intersect';
  assert jsonb_array_length(public.document_request_recipients(filters || '{"designation":"ibo","ica":"signed"}', 'thepncl.com')) = 0, 'Filter intersection cannot broaden audience';
  assert jsonb_array_length(public.document_request_recipients(filters || '{"search":"%"}', 'thepncl.com')) = 0, 'Search is literal, not SQL wildcards';
  assert jsonb_array_length(public.document_request_recipients(filters || jsonb_build_object('joinedAfter', current_date::text), 'thepncl.com')) = 0, 'Join date cutoff';
  perform public.publish_document_request('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Test addendum','Instructions','edition.pdf',repeat('a',64),filters,
    array['a0000000-0000-0000-0000-000000000002'::uuid], true, 'ibo', 'both', 'together', 'thepncl.com');
  -- Retry must neither change the PDF nor add new recipients.
  perform public.publish_document_request('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Changed','Changed','changed.pdf',repeat('b',64),filters,
    array['a0000000-0000-0000-0000-000000000003'::uuid], false, 'all', 'both', 'together', 'thepncl.com');
  assert (select count(*) from public.portal_document_requests where campaign_id = 'b0000000-0000-0000-0000-000000000001') = 1, 'Retry is idempotent';
  assert (select pdf_path from public.portal_document_campaigns where id = 'b0000000-0000-0000-0000-000000000001') = 'edition.pdf', 'Published PDF is immutable';
  begin
    perform public.publish_document_request('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bad','','bad.pdf',repeat('a',64),filters,
      array['a0000000-0000-0000-0000-000000000004'::uuid], false, 'all', 'both', 'together', 'thepncl.com');
    raise exception 'Expected audience validation to fail';
  exception when raise_exception then assert sqlerrm like 'The audience changed%', 'Invalid recipient rejected atomically'; end;
  assert not exists(select 1 from public.portal_document_campaigns where id = 'b0000000-0000-0000-0000-000000000002'), 'No partial campaign';
  perform public.ensure_onboarding_document_requests('a0000000-0000-0000-0000-000000000003', 'thepncl.com');
  assert not exists(select 1 from public.portal_document_requests where user_id = 'a0000000-0000-0000-0000-000000000003'), 'Future onboarding does not backfill old accounts';
end $$;

insert into auth.users(id, email, created_at, raw_app_meta_data) values
 ('a0000000-0000-0000-0000-000000000006','docs-new-ibo@thepncl.com',now() + interval '1 second','{}'),
 ('a0000000-0000-0000-0000-000000000007','docs-new-loa@thepncl.com',now() + interval '1 second','{}');
insert into public.portal_profiles(user_id,first_name,last_name) values ('a0000000-0000-0000-0000-000000000006','Future','IBO');
insert into public.portal_agent_designations(user_id,designation) values ('a0000000-0000-0000-0000-000000000006','ibo');
do $$ declare claimed integer; report jsonb; begin
  perform public.ensure_onboarding_document_requests('a0000000-0000-0000-0000-000000000006', 'thepncl.com');
  perform public.ensure_onboarding_document_requests('a0000000-0000-0000-0000-000000000006', 'thepncl.com');
  perform public.ensure_onboarding_document_requests('a0000000-0000-0000-0000-000000000007', 'thepncl.com');
  assert (select count(*) from public.portal_document_requests where source='onboarding') = 1, 'Future IBO assigned once; future LOA excluded';
  select count(*) into claimed from public.claim_document_notifications('b0000000-0000-0000-0000-000000000001');
  assert claimed = 2, 'Rollout and future onboarding emails queued';
  select count(*) into claimed from public.claim_document_notifications('b0000000-0000-0000-0000-000000000001');
  assert claimed = 0, 'In-flight email cannot be claimed twice';
  update public.portal_document_requests set notification_attempted_at = now() - interval '11 minutes' where source='rollout';
  select count(*) into claimed from public.claim_document_notifications('b0000000-0000-0000-0000-000000000001');
  assert claimed = 1, 'Abandoned email lease can be retried';
  perform public.set_document_onboarding('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',false,'ibo');
  assert (select count(*) from public.portal_document_requests where campaign_id = 'b0000000-0000-0000-0000-000000000001') = 2, 'Disabling future onboarding preserves assignments';
  report := public.document_request_report('b0000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(report) = 2, 'Report includes every assignment';
  assert not (report->0 ? 'ip_address'), 'Admin report excludes unneeded signature telemetry';
  assert not has_table_privilege('authenticated','public.portal_document_requests','UPDATE'), 'Agents cannot forge signatures';
  assert not has_table_privilege('anon','public.portal_document_campaigns','SELECT'), 'Documents are private';
  assert not has_function_privilege('authenticated','public.ensure_onboarding_document_requests(uuid,text)','EXECUTE'), 'Agents cannot assign arbitrary requests';
  assert not has_function_privilege('anon','public.document_request_recipients(jsonb,text)','EXECUTE'), 'No anonymous recipient enumeration';
  assert (select relrowsecurity from pg_class where oid = 'public.portal_document_requests'::regclass), 'RLS enabled';
end $$;
-- Stage order controls both access and delivery; release is explicit and idempotent.
do $$ declare filters jsonb := '{"designation":"all","search":"docs-","state":"","ica":"all","joinedBefore":"","joinedAfter":""}'; claimed integer; begin
  perform public.publish_document_request('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Onboarding first','','onboarding-first.pdf',repeat('a',64),filters,
    array['a0000000-0000-0000-0000-000000000002'::uuid], true, 'ibo', 'both', 'onboarding_first', 'thepncl.com');
  assert (select onboarding_enabled from public.portal_document_campaigns where id='b0000000-0000-0000-0000-000000000003'), 'First onboarding stage active';
  assert (select released_at is null and notification_status='none' from public.portal_document_requests where campaign_id='b0000000-0000-0000-0000-000000000003'), 'Current agents held without email';
  select count(*) into claimed from public.claim_document_notifications('b0000000-0000-0000-0000-000000000003');
  assert claimed=0, 'Held requests cannot send email';
  perform public.release_document_current_agents('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001');
  assert (select released_at is not null and notification_status='queued' from public.portal_document_requests where campaign_id='b0000000-0000-0000-0000-000000000003'), 'Release activates access and selected delivery';
  select count(*) into claimed from public.claim_document_notifications('b0000000-0000-0000-0000-000000000003');
  assert claimed=1, 'Released current agent email claimed';
  perform public.release_document_current_agents('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001');
  assert (select notification_status='sending' from public.portal_document_requests where campaign_id='b0000000-0000-0000-0000-000000000003'), 'Repeated release cannot requeue notifications';
  perform public.publish_document_request('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Current first','','current-first.pdf',repeat('a',64),filters,
    array['a0000000-0000-0000-0000-000000000002'::uuid], true, 'ibo', 'portal', 'current_first', 'thepncl.com');
  assert (select onboarding_pending and not onboarding_enabled from public.portal_document_campaigns where id='b0000000-0000-0000-0000-000000000004'), 'Second onboarding stage waits';
  perform public.ensure_onboarding_document_requests('a0000000-0000-0000-0000-000000000006','thepncl.com');
  assert not exists(select 1 from public.portal_document_requests where campaign_id='b0000000-0000-0000-0000-000000000004' and source='onboarding'), 'Held onboarding cannot assign';
  perform public.set_document_onboarding('b0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001',false,'ibo');
  assert (select onboarding_pending from public.portal_document_campaigns where id='b0000000-0000-0000-0000-000000000004'), 'Saving audience does not cancel a waiting stage';
  perform public.set_document_onboarding('b0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001',true,'ibo');
  assert (select not onboarding_pending and onboarding_enabled from public.portal_document_campaigns where id='b0000000-0000-0000-0000-000000000004'), 'Explicit activation clears pending stage';
  perform public.ensure_onboarding_document_requests('a0000000-0000-0000-0000-000000000006','thepncl.com');
  assert (select count(*) from public.portal_document_requests where campaign_id='b0000000-0000-0000-0000-000000000004')=2, 'Both stages assigned after release';
  select count(*) into claimed from public.claim_document_notifications('b0000000-0000-0000-0000-000000000004');
  assert claimed=0, 'Portal-only mode never queues email in either stage';
  select count(*) into claimed from public.claim_document_notifications(null,'a0000000-0000-0000-0000-000000000006',false);
  assert claimed=1, 'Automatic onboarding email claims only this agent';
  update public.portal_document_requests set notification_status='failed', notification_attempted_at=now() where user_id='a0000000-0000-0000-0000-000000000006' and notification_status='sending';
  select count(*) into claimed from public.claim_document_notifications(null,'a0000000-0000-0000-0000-000000000006',false);
  assert claimed=0, 'Automatic retry backs off after a failure';
  assert not has_function_privilege('authenticated','public.release_document_current_agents(uuid,uuid)','EXECUTE'), 'Stage release is admin-only';
end $$;
-- More than the default 1,000-row REST limit must still be previewable.
insert into auth.users(id, email, created_at, raw_app_meta_data)
select gen_random_uuid(), 'docs-bulk-' || n || '@thepncl.com', now(), '{}'::jsonb from generate_series(1,1205) n;
do $$ begin
  assert jsonb_array_length(public.document_request_recipients('{"designation":"all","search":"docs-bulk-","state":"","ica":"all","joinedBefore":"","joinedAfter":""}', 'thepncl.com')) = 1205, 'Recipient preview is not silently truncated';
end $$;
set local role service_role;
do $$ begin
  assert jsonb_array_length(public.document_request_recipients('{"designation":"all","search":"docs-bulk-","state":"","ica":"all","joinedBefore":"","joinedAfter":""}', 'thepncl.com')) = 1205, 'Invoker rights work with the deployed service role';
  assert jsonb_array_length(public.document_request_report('b0000000-0000-0000-0000-000000000001')) = 2, 'Service role can read the report';
end $$;
reset role;
rollback;
