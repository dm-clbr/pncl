begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001');
-- Signed history is untouched by new configuration requirements.
insert into public.portal_comp_attachments(id,user_id,unsigned_pdf_path,status) values ('00000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000001','legacy.pdf','pending');
set local role service_role;
insert into public.onboarding_content_assets(id,designation,kind,path,filename,content_type,size_bytes,sha256,signing_mode) values
('10000000-0000-0000-0000-000000000001','loa','ica','loa/ica/one.pdf','one.pdf','application/pdf',100,repeat('a',64),'signature_record'),
('10000000-0000-0000-0000-000000000002','loa','ica','loa/ica/two.pdf','two.pdf','application/pdf',100,repeat('b',64),'signature_record'),
('10000000-0000-0000-0000-000000000003','ibo','ica','ibo/ica/three.pdf','three.pdf','application/pdf',100,repeat('c',64),'signature_record'),
('10000000-0000-0000-0000-000000000004','loa','w9','loa/w9/source.pdf','w9.pdf','application/pdf',100,repeat('d',64),'w9_fields');
do $$
declare row_id uuid; stamp text; payload jsonb;
begin
  select id,updated_at::text into row_id,stamp from public.portal_todos where slug='ica_setup';
  payload := jsonb_build_object('id',row_id,'slug','ica_setup','title','ICA','description','Review and sign','href','/portal/ica','actionLabel','Sign','showLoa',true,'showIbo',false,'published',true,'phase','on_board','completionType','auto','autoKey','ica','contentType','ica','updatedAt',stamp,'flowContent','{}'::jsonb);
  begin
    perform public.save_onboarding_editor_step(payload);
    raise exception 'TEST FAILED: published missing source';
  exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; if sqlerrm not like 'Upload the signing PDF%' then raise; end if; end;
  begin
    perform public.save_onboarding_editor_step(payload || jsonb_build_object('flowContent',jsonb_build_object('loa',jsonb_build_object('mode','file','assetId','10000000-0000-0000-0000-000000000003'))));
    raise exception 'TEST FAILED: accepted wrong flow';
  exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; if sqlerrm not like 'The selected file%' then raise; end if; end;
  perform public.save_onboarding_editor_step(payload || jsonb_build_object('flowContent',jsonb_build_object('loa',jsonb_build_object('mode','file','assetId','10000000-0000-0000-0000-000000000001'))));
  if (select ica_asset_id from public.onboarding_flow_content where designation='loa') <> '10000000-0000-0000-0000-000000000001'::uuid then raise exception 'TEST FAILED: source not published'; end if;
end $$;
-- Preparing sources must not block legacy signatures or change the frozen checklist.
do $$ begin
  if (select enabled from public.onboarding_signing_rollout) then raise exception 'TEST FAILED: activation defaulted on'; end if;
  if not exists(select 1 from public.onboarding_signing_rollout, jsonb_array_elements(legacy_steps) s where s->>'slug'='comp_agreement' and s->>'completion_type'='agent') then raise exception 'TEST FAILED: previous checklist lost'; end if;
  begin
    perform public.set_onboarding_signing_rollout(true,0,'00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: activated missing sources';
  exception when others then if sqlerrm not like 'Configure the % PDF for % before activating%' then raise; end if; end;
end $$;
insert into public.portal_ica_signatures(user_id,signed_at,agent_designation) values ('00000000-0000-0000-0000-000000000001',now(),'loa');
delete from public.portal_ica_signatures;
-- Preview enforces uploaded source guards for this account while global activation stays off.
insert into public.onboarding_signing_preview_users(user_id) values ('00000000-0000-0000-0000-000000000001') on conflict(user_id) do update set created_at=now();
do $$ begin
  begin
    insert into public.portal_ica_signatures(user_id,signed_at,agent_designation) values ('00000000-0000-0000-0000-000000000001',now(),'loa');
    raise exception 'TEST FAILED: preview bypassed source verification';
  exception when others then if sqlerrm not like 'The document has changed%' then raise; end if; end;
  if (select enabled from public.onboarding_signing_rollout) then raise exception 'TEST FAILED: preview activated everyone'; end if;
end $$;
delete from public.onboarding_signing_preview_users;
-- Only the configured ICA is enabled for this test flow.
update public.portal_todos set published=false where slug in ('w9_setup','direct_deposit_setup','comp_agreement');
select public.set_onboarding_signing_rollout(true,0,'00000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.set_onboarding_signing_rollout(false,0,'00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: accepted stale activation revision';
  exception when others then if sqlerrm not like 'Signing activation changed%' then raise; end if; end;
end $$;
-- Previously assigned compensation still signs while uploaded signing is active.
update public.portal_comp_attachments set signed_at=now(),status='signed' where id='00000000-0000-0000-0000-000000000099';
-- Each completed signature must reference the enabled current source and hash.
do $$
begin
  begin
    insert into public.portal_ica_signatures(user_id,signed_at,agent_designation) values ('00000000-0000-0000-0000-000000000001',now(),'loa');
    raise exception 'TEST FAILED: signed without source';
  exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; if sqlerrm not like 'The document has changed%' then raise; end if; end;
  begin
    insert into public.portal_ica_signatures(user_id,signed_at,agent_designation,template_asset_id,template_sha256) values ('00000000-0000-0000-0000-000000000001',now(),'loa','10000000-0000-0000-0000-000000000002',repeat('b',64));
    raise exception 'TEST FAILED: signed stale source';
  exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; if sqlerrm not like 'The document has changed%' then raise; end if; end;
  begin
    insert into public.portal_ica_signatures(user_id,signed_at,agent_designation,template_asset_id,template_sha256) values ('00000000-0000-0000-0000-000000000001',now(),'loa','10000000-0000-0000-0000-000000000001',repeat('x',64));
    raise exception 'TEST FAILED: signed wrong hash';
  exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; if sqlerrm not like 'The uploaded document%' then raise; end if; end;
end $$;
insert into public.portal_ica_signatures(user_id,signed_at,agent_designation,template_asset_id,template_sha256,pdf_path) values ('00000000-0000-0000-0000-000000000001',now(),'loa','10000000-0000-0000-0000-000000000001',repeat('a',64),'original-signed.pdf');
update public.onboarding_flow_content set ica_asset_id='10000000-0000-0000-0000-000000000002' where designation='loa';
do $$ begin
  if not exists(select 1 from public.portal_ica_signatures where template_asset_id='10000000-0000-0000-0000-000000000001' and pdf_path='original-signed.pdf') then raise exception 'TEST FAILED: history changed'; end if;
  if not exists(select 1 from public.portal_todos where slug='comp_agreement' and completion_type='auto' and auto_key='comp_agreement') then raise exception 'TEST FAILED: compensation allows manual completion'; end if;
end $$;
select public.set_onboarding_signing_rollout(false,1,'00000000-0000-0000-0000-000000000001');
do $$ begin
  if (select enabled or revision<>2 from public.onboarding_signing_rollout) then raise exception 'TEST FAILED: rollback failed'; end if;
end $$;
reset role;
do $$
begin
  if has_table_privilege('authenticated','public.onboarding_signing_preview_users','insert') or has_table_privilege('anon','public.onboarding_signing_rollout','select') or has_function_privilege('authenticated','public.set_onboarding_signing_rollout(boolean,integer,uuid)','execute') then raise exception 'TEST FAILED: activation is publicly accessible'; end if;
  if has_function_privilege('authenticated','public.save_onboarding_editor_step(jsonb)','execute') or has_function_privilege('anon','public.guard_onboarding_signing_source()','execute') then raise exception 'TEST FAILED: signature configuration is public'; end if;
  if has_table_privilege('authenticated','public.onboarding_content_assets','insert') or has_table_privilege('anon','public.portal_comp_attachments','select') then raise exception 'TEST FAILED: source or signature tables are exposed'; end if;
end $$;
rollback;
