-- Run in an empty disposable PostgreSQL database; all people and banking rows are synthetic.
\ir required_document_editions.sql
alter table public.portal_todos
  add column href text, add column external boolean, add column action_label text,
  add column show_email_hint boolean, add column sort_order integer, add column phase text,
  add column completion_type text, add column auto_key text, add column gated boolean;
create table public.onboarding_signing_rollout(id boolean primary key,enabled boolean,revision integer,updated_at timestamptz,updated_by uuid);
insert into public.onboarding_signing_rollout values(true,false,0,now(),null);
create function public.native_deposit_test_guard() returns trigger language plpgsql as $$begin raise exception 'Uploaded template required'; end$$;
create trigger portal_direct_deposit_source before insert or update on public.portal_direct_deposit_forms for each row execute function public.native_deposit_test_guard();
\ir ../migrations/20261113213803_direct_deposit_coded_form.sql

do $$
declare
  step_id uuid := gen_random_uuid();
  actor uuid := (select id from auth.users limit 1);
  campaign_count integer := (select count(*) from public.portal_document_campaigns);
  request_count integer := (select count(*) from public.portal_document_requests);
  settings jsonb := (select jsonb_agg(to_jsonb(f)) from public.onboarding_flow_content f);
  payload jsonb;
begin
  payload := jsonb_build_object('id',step_id,'slug','direct_deposit_setup','contentType','direct_deposit','title','Direct deposit','description','Enter banking information','href','/obsolete.pdf','external',true,'actionLabel','Open form','published',true,'showLoa',true,'showIbo',false,'phase','on_board','completionType','auto','autoKey','direct_deposit_setup','flowContent',jsonb_build_object('loa',jsonb_build_object('mode','file','assetId',gen_random_uuid()),'attachments','{}'::jsonb));
  perform public.save_onboarding_editor_step(payload);
  if not exists(select 1 from public.portal_todos where id=step_id and published and href='/portal/direct-deposit' and not external and flow_content='{"attachments":{}}') then raise exception 'Coded deposit was not saved without PDF'; end if;
  if (select count(*) from public.portal_document_campaigns)<>campaign_count or (select count(*) from public.portal_document_requests)<>request_count then raise exception 'Coded deposit created signing requests'; end if;
  if settings is distinct from (select jsonb_agg(to_jsonb(f)) from public.onboarding_flow_content f) then raise exception 'Coded deposit changed uploaded signing settings'; end if;
  update public.portal_todos set published=false where id<>step_id;
  perform public.set_onboarding_signing_rollout(true,0,actor);
  if not exists(select 1 from public.onboarding_signing_rollout where enabled and revision=1) then raise exception 'Coded deposit blocked activation'; end if;
  insert into public.portal_direct_deposit_forms(user_id,signed_at) values(gen_random_uuid(),now());
  if exists(select 1 from pg_trigger where tgname='portal_direct_deposit_source' and tgrelid='public.portal_direct_deposit_forms'::regclass) then raise exception 'Deposit still requires uploaded source'; end if;
  begin
    perform public.save_onboarding_editor_step(payload || jsonb_build_object('id',gen_random_uuid(),'slug','ica_setup','contentType','ica','flowContent','{}'::jsonb));
    raise exception 'Missing ICA PDF was accepted';
  exception when others then
    if sqlerrm not like 'Upload the signing PDF%' then raise; end if;
  end;
  raise notice 'PASS: coded deposit publication, generated-form submission, no PDF or assignments, and preserved ICA guards';
end $$;
