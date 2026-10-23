begin;
insert into public.portal_todos(slug,title,description,href,external,action_label,show_email_hint,sort_order,published,phase,completion_type,auto_key,gated,show_loa,show_ibo)
values ('surelc_tutorial','SureLC','Watch','',true,'Watch',false,1,false,'licensing','agent',null,false,true,false),
('surelc_tutorial_ibo','SureLC IBO','Watch','',true,'Watch',false,1,false,'licensing','agent',null,false,false,true);
insert into public.onboarding_content_assets(id,designation,kind,path,filename,content_type,size_bytes,sha256)
values('00000000-0000-4000-8000-000000000301','loa','document','loa/document/test.pdf','test.pdf','application/pdf',100,repeat('a',64));
do $$
declare saved_id uuid; payload jsonb; rev integer;
begin
 assert not has_function_privilege('authenticated','public.save_onboarding_editor_step(jsonb)','execute');
 assert not has_table_privilege('anon','public.onboarding_flow_rules','select');
 assert (select relrowsecurity from pg_class where oid='public.onboarding_flow_rules'::regclass);
 payload := '{"slug":"new_resource","title":"Resource","description":"Read","href":"","actionLabel":"Open","showLoa":true,"showIbo":true,"published":false,"phase":"on_board","completionType":"agent","contentType":"document","flowContent":{"loa":{"mode":"file","assetId":"00000000-0000-4000-8000-000000000301","url":"https://example.com/test.pdf"}}}'::jsonb;
 saved_id := public.save_onboarding_editor_step(payload);
 assert exists(select 1 from public.portal_todos where portal_todos.id=saved_id and title='Resource');
 begin
   perform public.save_onboarding_editor_step(payload || jsonb_build_object('id',saved_id,'updatedAt','2000-01-01T00:00:00Z'));
   raise exception 'Expected stale write to fail';
 exception when others then
   if sqlerrm <> 'This step changed in another session. Reload before saving.' then raise; end if;
 end;
 begin
   perform public.save_onboarding_editor_step(payload || '{"flowContent":{"ibo":{"mode":"file","assetId":"00000000-0000-4000-8000-000000000301"}}}'::jsonb);
   raise exception 'Expected wrong-flow file to fail';
 exception when others then
   if sqlerrm <> 'The selected file is not available for this flow.' then raise; end if;
 end;
 select portal_todos.id into saved_id from public.portal_todos where slug='surelc_tutorial';
 payload := jsonb_build_object('id',saved_id,'slug','surelc_tutorial','title','Updated SureLC','description','Watch training','href','','actionLabel','Watch','showLoa',true,'showIbo',true,'published',true,'phase','licensing','completionType','agent','contentType','surelc_video','flowContent','{"loa":{"mode":"link","url":"https://example.com/loa.mp4"},"ibo":{"mode":"link","url":"https://example.com/ibo.mp4"}}'::jsonb);
 perform public.save_onboarding_editor_step(payload);
 assert (select welcome_video_url is null and surelc_video_url='https://example.com/loa.mp4' from public.onboarding_flow_content where designation='loa');
 assert (select surelc_video_url='https://example.com/ibo.mp4' from public.onboarding_flow_content where designation='ibo');
 assert (select title='Updated SureLC' and not show_loa and show_ibo from public.portal_todos where slug='surelc_tutorial_ibo');
 assert (select show_loa and not show_ibo from public.portal_todos where slug='surelc_tutorial');
 payload := jsonb_set(payload, '{flowContent,attachments}', '{"loa":[{"mode":"file","assetId":"00000000-0000-4000-8000-000000000301","url":"https://example.com/loa.pdf","filename":"LOA reference.pdf"}],"ibo":[]}'::jsonb);
 perform public.save_onboarding_editor_step(payload);
 assert (select flow_content->'attachments' = payload->'flowContent'->'attachments' from public.portal_todos where slug='surelc_tutorial'), 'Save keeps video and supporting documents together';
 assert (select flow_content->'attachments' = payload->'flowContent'->'attachments' from public.portal_todos where slug='surelc_tutorial_ibo'), 'Paired IBO row keeps the independent attachment lists';
 assert (select surelc_video_url='https://example.com/loa.mp4' from public.onboarding_flow_content where designation='loa'), 'Adding references must retain the video';

 perform public.save_onboarding_editor_step(payload || '{"published":false,"flowContent":{"loa":{"mode":"link","url":"https://example.com/draft.mp4"}}}'::jsonb);
 assert (select surelc_video_url='https://example.com/loa.mp4' from public.onboarding_flow_content where designation='loa');
 perform public.save_onboarding_editor_step(payload || '{"showLoa":false,"flowContent":{"ibo":{"mode":"link","url":"https://example.com/ibo.mp4"}}}'::jsonb);
 assert (select surelc_video_url is null and surelc_video_asset_id is null from public.onboarding_flow_content where designation='loa');
 assert (select surelc_video_url='https://example.com/ibo.mp4' from public.onboarding_flow_content where designation='ibo');
 rev := public.save_onboarding_flow_rules('loa','{"portalOrder":[]}',0);
 assert rev=1;
 begin
   perform public.save_onboarding_flow_rules('loa','{}',0);
   raise exception 'Expected stale flow to fail';
 exception when others then
   if sqlerrm <> 'This flow changed in another session. Reload before saving.' then raise; end if;
 end;
 assert not exists(select 1 from public.onboarding_flow_rules where designation='ibo');
end $$;
rollback;
