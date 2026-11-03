-- Run against a disposable database with the staged-signing and library migrations.
begin;
insert into auth.users(id,email,created_at,raw_app_meta_data) values
 ('d1000000-0000-0000-0000-000000000001','library-admin@thepncl.com',now()-interval '1 year','{"role":"admin"}'),
 ('d1000000-0000-0000-0000-000000000002','library-loa@thepncl.com',now()-interval '1 year','{}'),
 ('d1000000-0000-0000-0000-000000000003','library-ibo@thepncl.com',now()-interval '1 year','{}'),
 ('d1000000-0000-0000-0000-000000000004','library-new@thepncl.com',now()+interval '1 hour','{}');
insert into portal_agent_designations(user_id,designation) values('d1000000-0000-0000-0000-000000000003','ibo');
insert into onboarding_content_assets(id,designation,kind,path,filename,content_type,size_bytes,sha256,created_by) values
 ('d2000000-0000-0000-0000-000000000001','loa','signing_document','library/old.pdf','old.pdf','application/pdf',100,repeat('a',64),'d1000000-0000-0000-0000-000000000001'),
 ('d2000000-0000-0000-0000-000000000002','loa','signing_document','library/new.pdf','new.pdf','application/pdf',100,repeat('b',64),'d1000000-0000-0000-0000-000000000001'),
 ('d2000000-0000-0000-0000-000000000003','loa','signing_document','library/later.pdf','later.pdf','application/pdf',100,repeat('c',64),'d1000000-0000-0000-0000-000000000001'),
 ('d2000000-0000-0000-0000-000000000004','ibo','signing_document','library/ibo.pdf','ibo.pdf','application/pdf',100,repeat('d',64),'d1000000-0000-0000-0000-000000000001');
insert into portal_todos(id,slug,title,description,href,action_label,phase,published,show_loa,show_ibo,content_type,flow_content)
values('d3000000-0000-0000-0000-000000000001','book_addendum','Own your book','Review and sign','','Sign','pre_license',true,true,false,'signing_document',
 '{"loa":{"mode":"file","assetId":"d2000000-0000-0000-0000-000000000001"}}');

do $$ declare f jsonb := '{"designation":"loa","search":"library-","state":"","ica":"all","joinedBefore":"","joinedAfter":""}'; result uuid; begin
  assert (select count(*) from portal_document_campaigns where onboarding_step_id='d3000000-0000-0000-0000-000000000001')=1,'Saving a signing step creates one shared PDF edition';
  assert not exists(select 1 from portal_document_requests where campaign_id='d2000000-0000-0000-0000-000000000001'),'Saving does not send requests';
  assert (select completion_type='auto' and auto_key is null from portal_todos where slug='book_addendum'),'Signing is never a manual checkbox';
  perform ensure_onboarding_document_requests('d1000000-0000-0000-0000-000000000004','thepncl.com');
  assert not exists(select 1 from portal_document_requests where user_id='d1000000-0000-0000-0000-000000000004'),'Global off preserves existing signing';
  result := publish_onboarding_document_rollout('d4000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','loa','d2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001',f,array['d1000000-0000-0000-0000-000000000002'::uuid],'both','current_first','thepncl.com');
  assert result='d2000000-0000-0000-0000-000000000002','Rollout uses immutable onboarding asset';
  assert (select flow_content->'loa'->>'assetId' from portal_todos where slug='book_addendum')='d2000000-0000-0000-0000-000000000001','Current-first holds old onboarding selection';
  assert (select onboarding_pending and not onboarding_enabled and source_bucket='onboarding-content' from portal_document_campaigns where id=result),'New PDF stage held';
  assert (select released_at is not null and notification_status='queued' from portal_document_requests where campaign_id=result),'Only current agents released';
  perform publish_onboarding_document_rollout('d4000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','loa','d2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001',f,array['d1000000-0000-0000-0000-000000000002'::uuid],'both','current_first','thepncl.com');
  assert (select count(*) from portal_document_requests where campaign_id=result)=1,'Retry cannot duplicate recipients';
  begin
    perform publish_onboarding_document_rollout('d4000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','loa','d2000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000001',f,array['d1000000-0000-0000-0000-000000000003'::uuid],'both','together','thepncl.com');
    raise exception 'expected invalid recipient rejection';
  exception when raise_exception then assert sqlerrm like 'The audience changed%','Wrong-flow recipient rejected'; end;
  assert not exists(select 1 from portal_document_campaigns where id='d2000000-0000-0000-0000-000000000003'),'No partial edition on failed rollout';
  perform set_document_onboarding(result,'d1000000-0000-0000-0000-000000000001',true,'loa');
  assert (select flow_content->'loa'->>'assetId' from portal_todos where slug='book_addendum')=result::text,'Starting future stage updates actual step';
  assert (select onboarding_enabled and not onboarding_pending from portal_document_campaigns where id=result),'Stage is selected';
  perform set_document_onboarding(result,'d1000000-0000-0000-0000-000000000001',true,'loa');
  assert (select count(*) from portal_document_requests where campaign_id=result)=1,'Stage retry cannot send or assign again';
end $$;
-- Prepare and activate only the test signing row; fixture standard rows are not enabled.
update portal_todos set published=false where slug in ('ica_setup','w9_setup','direct_deposit_setup','comp_agreement');
select set_onboarding_signing_rollout(true,(select revision from onboarding_signing_rollout where id),'d1000000-0000-0000-0000-000000000001');
select ensure_onboarding_document_requests('d1000000-0000-0000-0000-000000000004','thepncl.com');
do $$ declare progress jsonb; begin
  assert (select count(*) from portal_document_requests where user_id='d1000000-0000-0000-0000-000000000004')=1,'New agent receives current linked edition only';
  assert (select campaign_id from portal_document_requests where user_id='d1000000-0000-0000-0000-000000000004')='d2000000-0000-0000-0000-000000000002','Future uses same PDF as rollout';
  progress := onboarding_document_progress(array['d1000000-0000-0000-0000-000000000004'::uuid]);
  assert progress->0->>'phase'='pre_license','Reporting uses the linked step stage';
  assert not has_function_privilege('authenticated','public.publish_onboarding_document_rollout(uuid,uuid,uuid,text,uuid,uuid,jsonb,uuid[],text,text,text)','execute'),'Agents cannot publish rollouts';
  assert not has_function_privilege('anon','public.onboarding_document_progress(uuid[])','execute'),'Progress is private';
end $$;
-- Onboarding-first switches the shared source while holding all current-agent delivery.
do $$ declare result uuid; f jsonb := '{"designation":"loa","search":"library-","state":"","ica":"all","joinedBefore":"","joinedAfter":""}'; begin
  result := publish_onboarding_document_rollout('d4000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','loa','d2000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000002',f,array['d1000000-0000-0000-0000-000000000002'::uuid],'both','onboarding_first','thepncl.com');
  assert (select flow_content->'loa'->>'assetId' from portal_todos where slug='book_addendum')=result::text,'Onboarding-first selects the new PDF immediately';
  assert (select released_at is null and notification_status='none' from portal_document_requests where campaign_id=result),'Current agents remain held without email';
  assert not exists(select 1 from jsonb_array_elements(onboarding_document_progress(array['d1000000-0000-0000-0000-000000000002'::uuid])) p where p->>'campaign_id'=result::text),'Held recipients are absent from progress';
  perform release_document_current_agents(result,'d1000000-0000-0000-0000-000000000001');
  perform release_document_current_agents(result,'d1000000-0000-0000-0000-000000000001');
  assert (select count(*) from portal_document_requests where campaign_id=result and released_at is not null and notification_status='queued')=1,'Explicit stage release is idempotent';
end $$;
-- A later step edit must never be overwritten by an older pending rollout stage.
update portal_todos set flow_content=jsonb_set(flow_content,'{loa,assetId}','"d2000000-0000-0000-0000-000000000003"') where slug='book_addendum';
do $$ begin
  begin
    perform set_document_onboarding('d2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001',true,'loa');
    raise exception 'expected stale stage rejection';
  exception when raise_exception then assert sqlerrm like 'The step PDF changed after%','Stale stage rejected'; end;
  assert (select count(*) from portal_document_requests where campaign_id='d2000000-0000-0000-0000-000000000002')=2,'Previous assignments survive source replacement';
end $$;
rollback;
