-- Run only in an empty disposable PostgreSQL database with psql -v ON_ERROR_STOP=1.
-- Exercises the real publication/catalog functions and migration against synthetic users.
create schema auth;
create role anon; create role authenticated; create role service_role;
create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',banned_until timestamptz,deleted_at timestamptz);
create table public.portal_profiles(user_id uuid,first_name text,last_name text,address_state text);
create table public.portal_agent_designations(user_id uuid,designation text);
create table public.onboarding_records(id uuid,supabase_user_id text);
create table public.onboarding_content_assets(id uuid primary key,designation text,kind text,path text,filename text,size_bytes bigint,sha256 text,created_by uuid);
create table public.portal_todos(id uuid primary key,slug text,title text,description text,content_type text,flow_content jsonb default '{}',published boolean,show_loa boolean,show_ibo boolean,updated_at timestamptz default now());
create table public.onboarding_flow_content(designation text,ica_asset_id uuid,w9_asset_id uuid,direct_deposit_asset_id uuid,comp_agreement_asset_id uuid,updated_at timestamptz);
create table public.admin_audit_log(admin_user_id uuid,action text,changes jsonb);
create table public.portal_ica_signatures(user_id uuid,template_asset_id uuid,template_sha256 text,signed_at timestamptz);
create table public.onboarding_contract_signatures(onboarding_id uuid,template_asset_id uuid,template_sha256 text,signed_at timestamptz);
create table public.portal_w9_forms(like public.portal_ica_signatures);
create table public.portal_direct_deposit_forms(like public.portal_ica_signatures);
create table public.portal_comp_attachments(like public.portal_ica_signatures);
create table public.portal_document_campaigns (
  id uuid primary key,
  title text not null check (length(title) between 1 and 160),
  description text not null default '' check (length(description) <= 2000),
  pdf_path text not null unique,
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  filters jsonb not null,
  delivery_mode text not null check (delivery_mode in ('email', 'portal', 'both')),
  rollout_order text not null check (rollout_order in ('together', 'current_first', 'onboarding_first')),
  onboarding_pending boolean not null default false,
  onboarding_enabled boolean not null default false,
  onboarding_audience text not null check (onboarding_audience in ('all', 'loa', 'ibo')),
  onboarding_since timestamptz not null default now()
);
create table public.portal_document_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.portal_document_campaigns(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  released_at timestamptz default now(),
  source text not null check (source in ('rollout', 'onboarding')),
  signed_at timestamptz,
  signature_name text,
  consent_text text,
  signed_pdf_path text,
  ip_address text,
  user_agent text,
  notification_status text not null default 'queued' check (notification_status in ('queued', 'sending', 'sent', 'failed', 'none')),
  notification_attempted_at timestamptz,
  notification_sent_at timestamptz,
  notification_error text,
  unique(campaign_id, user_id),
  check (released_at is not null or (signed_at is null and notification_status = 'none')),
  check ((signed_at is null and signature_name is null and signed_pdf_path is null)
    or (signed_at is not null and signature_name is not null and signed_pdf_path is not null and consent_text is not null))
);
alter table public.portal_document_campaigns alter column created_by drop not null;
alter table public.portal_document_campaigns
  add column source_bucket text not null default 'portal-signing-documents' check (source_bucket in ('portal-signing-documents','onboarding-content')),
  add column onboarding_step_id uuid references public.portal_todos(id),
  add column onboarding_asset_id uuid unique references public.onboarding_content_assets(id),
  add column onboarding_previous_asset_id uuid references public.onboarding_content_assets(id),
  add column onboarding_flow text check (onboarding_flow in ('loa','ibo')),
  add column rollout_request_id uuid unique,
  add constraint document_step_link_complete check ((onboarding_step_id is null and onboarding_asset_id is null and onboarding_flow is null and source_bucket='portal-signing-documents') or
    (onboarding_step_id is not null and onboarding_asset_id is not null and onboarding_flow is not null and source_bucket='onboarding-content'));
create index document_campaign_step_idx on public.portal_document_campaigns(onboarding_step_id);

create function public.document_request_recipients(p_filters jsonb, p_domain text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.name, r.id), '[]'::jsonb)
  from (
    select u.id, u.email,
      coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), nullif(u.raw_user_meta_data->>'full_name', ''), u.email) as name,
      coalesce(d.designation, 'loa') as designation,
      coalesce(p.address_state, '') as state,
      u.created_at as joined_at,
      exists(select 1 from public.portal_ica_signatures i where i.user_id = u.id) as ica_signed
    from auth.users u
    left join public.portal_profiles p on p.user_id = u.id
    left join public.portal_agent_designations d on d.user_id = u.id
    where lower(split_part(u.email, '@', 2)) = lower(p_domain)
      and coalesce(u.raw_app_meta_data->>'role', 'agent') = 'agent'
      and (u.banned_until is null or u.banned_until <= now())
      and u.deleted_at is null
  ) r
  where (p_filters->>'designation' = 'all' or r.designation = p_filters->>'designation')
    and (coalesce(p_filters->>'search', '') = '' or position(lower(p_filters->>'search') in lower(r.name || ' ' || r.email)) > 0)
    and (coalesce(p_filters->>'state', '') = '' or r.state = p_filters->>'state')
    and (p_filters->>'ica' = 'all' or r.ica_signed = (p_filters->>'ica' = 'signed'))
    and (nullif(p_filters->>'joinedAfter', '') is null or r.joined_at >= (p_filters->>'joinedAfter')::date::timestamptz)
    and (nullif(p_filters->>'joinedBefore', '') is null or r.joined_at < ((p_filters->>'joinedBefore')::date + 1)::timestamptz);
$$;

create function public.ensure_onboarding_document_edition(p_step uuid, p_flow text, p_asset uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare t public.portal_todos; a public.onboarding_content_assets; c public.portal_document_campaigns;
begin
  select * into t from public.portal_todos where id=p_step;
  select * into a from public.onboarding_content_assets where id=p_asset;
  if t.id is null or a.id is null or p_flow not in ('loa','ibo') or a.designation<>p_flow or a.kind<>t.content_type
    or t.content_type not in ('ica','w9','direct_deposit','comp_agreement','signing_document') or coalesce(a.sha256,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'The selected signing PDF does not belong to this step and flow.';
  end if;
  insert into public.portal_document_campaigns(id,title,description,pdf_path,pdf_sha256,created_by,filters,
    onboarding_enabled,onboarding_audience,delivery_mode,rollout_order,source_bucket,onboarding_step_id,onboarding_asset_id,onboarding_flow)
  values(a.id,left(t.title,160),t.description,a.path,a.sha256,a.created_by,
    jsonb_build_object('designation',p_flow,'search','','state','','ica','all','joinedBefore','','joinedAfter',''),
    false,p_flow,'portal','together','onboarding-content',t.id,a.id,p_flow)
  on conflict(onboarding_asset_id) do nothing;
  select * into c from public.portal_document_campaigns where onboarding_asset_id=a.id;
  if c.onboarding_step_id<>t.id or c.onboarding_flow<>p_flow or c.pdf_sha256<>a.sha256 or c.pdf_path<>a.path then
    raise exception 'This PDF edition is already linked to another step.';
  end if;
  return c.id;
end $$;

-- Keep the document catalog and onboarding selection in sync even when an admin
-- saves directly from the step editor. Generic PDFs get a signing edition too.
create function public.sync_onboarding_document_editions() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare f text; aid uuid; cid uuid; active boolean;
begin
  if new.content_type not in ('ica','w9','direct_deposit','comp_agreement','signing_document') then return new; end if;
  for f in select unnest(array['loa','ibo']) loop
    aid := nullif(new.flow_content->f->>'assetId','')::uuid;
    active := new.published and (case f when 'loa' then new.show_loa else new.show_ibo end);
    if aid is not null then
      cid := public.ensure_onboarding_document_edition(new.id,f,aid);
      update public.portal_document_campaigns set
        onboarding_since=case when active and not onboarding_enabled then clock_timestamp() else onboarding_since end,
        onboarding_enabled=active,
        onboarding_pending=case when active then false else onboarding_pending end
      where id=cid;
    end if;
    update public.portal_document_campaigns set onboarding_enabled=false
      where onboarding_step_id=new.id and onboarding_flow=f and onboarding_asset_id is distinct from aid;
  end loop;
  return new;
end $$;
create trigger sync_onboarding_document_editions after insert or update of flow_content,published,show_loa,show_ibo on public.portal_todos
for each row execute function public.sync_onboarding_document_editions();

create function public.select_onboarding_document_edition(p_campaign uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.portal_document_campaigns; t public.portal_todos; a public.onboarding_content_assets; selected uuid;
begin
  select * into c from public.portal_document_campaigns where id=p_campaign;
  if c.onboarding_step_id is null then raise exception 'This document is not linked to an onboarding step.'; end if;
  select * into t from public.portal_todos where id=c.onboarding_step_id for update;
  selected := nullif(t.flow_content->c.onboarding_flow->>'assetId','')::uuid;
  if selected is distinct from c.onboarding_previous_asset_id and selected is distinct from c.onboarding_asset_id then
    raise exception 'The step PDF changed after this rollout was prepared. Review the current step before continuing.';
  end if;
  if not t.published or not (case c.onboarding_flow when 'loa' then t.show_loa else t.show_ibo end) then
    raise exception 'Publish and enable this onboarding step for the selected flow first.';
  end if;
  select * into a from public.onboarding_content_assets where id=c.onboarding_asset_id and kind=t.content_type and designation=c.onboarding_flow and sha256=c.pdf_sha256;
  if not found then raise exception 'The linked signing PDF is no longer valid for this step.'; end if;
  update public.portal_todos set flow_content=jsonb_set(coalesce(flow_content,'{}'::jsonb),array[c.onboarding_flow],
    jsonb_build_object('mode','file','assetId',a.id,'filename',a.filename,'size',a.size_bytes)),updated_at=clock_timestamp() where id=t.id;
  -- Standard signing endpoints read these same selections.
  update public.onboarding_flow_content set
    ica_asset_id=case when a.kind='ica' then a.id else ica_asset_id end,
    w9_asset_id=case when a.kind='w9' then a.id else w9_asset_id end,
    direct_deposit_asset_id=case when a.kind='direct_deposit' then a.id else direct_deposit_asset_id end,
    comp_agreement_asset_id=case when a.kind='comp_agreement' then a.id else comp_agreement_asset_id end,
    updated_at=clock_timestamp() where designation=c.onboarding_flow;
end $$;

create function public.release_document_current_agents(p_id uuid, p_admin uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from auth.users where id = p_admin and raw_app_meta_data->>'role' = 'admin') then raise exception 'Full admin access required'; end if;
  if not exists(select 1 from public.portal_document_campaigns where id = p_id) then raise exception 'Document not found'; end if;
  update public.portal_document_requests r set released_at = now(), assigned_at = now(),
    notification_status = case when c.delivery_mode in ('email', 'both') then 'queued' else 'none' end
  from public.portal_document_campaigns c where c.id = p_id and r.campaign_id = c.id and r.released_at is null;
  if found then
    insert into public.admin_audit_log(admin_user_id, action, changes)
    values(p_admin, 'release_document_current_agents', jsonb_build_object('campaignId', p_id));
  end if;
end; $$;


insert into auth.users(id,email,raw_app_meta_data) values
 ('00000000-0000-0000-0000-000000000001','one@thepncl.com','{}'),
 ('00000000-0000-0000-0000-000000000002','two@thepncl.com','{}'),
 ('00000000-0000-0000-0000-000000000003','three@thepncl.com','{}'),
 ('00000000-0000-0000-0000-000000000004','ibo@thepncl.com','{}'),
 ('00000000-0000-0000-0000-000000000005','banned@thepncl.com','{}'),
 ('00000000-0000-0000-0000-000000000006','outside@example.invalid','{}'),
 ('00000000-0000-0000-0000-000000000007','admin@thepncl.com','{"role":"admin"}');
update auth.users set banned_until=now()+interval '1 day' where email='banned@thepncl.com';
insert into public.portal_agent_designations values('00000000-0000-0000-0000-000000000004','ibo');
insert into public.onboarding_flow_content(designation) values('loa'),('ibo');
-- This published edition predates the migration: installation must not assign it.
insert into public.onboarding_content_assets select '10000000-0000-0000-0000-000000000000','loa','signing_document','historical.pdf','historical.pdf',100,repeat('a',64),'00000000-0000-0000-0000-000000000007';
insert into public.portal_todos values('20000000-0000-0000-0000-000000000000','unrelated','Unrelated addendum','Test','signing_document','{"loa":{"assetId":"10000000-0000-0000-0000-000000000000"}}',true,true,false,now());
\ir ../migrations/20261113185812_require_published_document_editions.sql
\ir ../migrations/20261113211226_fix_required_document_user_id_comparison.sql

do $$
declare step_id uuid := '20000000-0000-0000-0000-000000000001'; a uuid; filters jsonb; recipients uuid[]; snapshot text; failed boolean;
begin
  assert (select count(*) from public.portal_document_requests)=0,'Migration backfilled unrelated editions';
  for i in 1..6 loop
    a := ('10000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid;
    insert into public.onboarding_content_assets values(a,case when i=6 then 'ibo' else 'loa' end,'ica',i||'.pdf',i||'.pdf',100,repeat(i::text,64),'00000000-0000-0000-0000-000000000007');
  end loop;
  insert into public.portal_ica_signatures values
    ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000000',repeat('a',64),now()),
    ('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',repeat('1',64),now());
  select md5(string_agg(to_jsonb(s)::text,'' order by user_id)) into snapshot from public.portal_ica_signatures s;
  insert into public.portal_todos values(step_id,'ica_setup','ICA','Test','ica','{"loa":{"assetId":"10000000-0000-0000-0000-000000000001"}}',false,true,true,now());
  assert (select count(*) from public.portal_document_requests)=0,'Draft assigned requests';
  update public.portal_todos set published=true where id=step_id;
  assert (select count(*) from public.portal_document_requests)=2,'Published edition did not include precisely the unsatisfied eligible LOA agents';
  assert exists(select 1 from public.portal_document_requests where user_id='00000000-0000-0000-0000-000000000001'),'Older signature incorrectly satisfied a new edition';
  assert not exists(select 1 from public.portal_document_requests where user_id='00000000-0000-0000-0000-000000000003'),'Exact-edition native signature was reissued';
  assert not exists(select 1 from public.portal_document_requests where notification_status<>'none'),'Publication queued external email';
  update public.portal_document_requests set signed_at=now(),signature_name='Test Agent',signed_pdf_path='immutable-signed.pdf',consent_text='test' where user_id='00000000-0000-0000-0000-000000000001';
  update public.portal_todos set flow_content=flow_content,title='ICA label edit' where id=step_id;
  assert (select count(*) from public.portal_document_requests)=2,'Unchanged edition duplicated requests';
  update public.portal_todos set flow_content='{"loa":{"assetId":"10000000-0000-0000-0000-000000000002"}}' where id=step_id;
  assert (select count(*) from public.portal_document_requests where campaign_id='10000000-0000-0000-0000-000000000002')=3,'New edition did not require fresh signatures';
  assert exists(select 1 from public.portal_document_requests where signed_pdf_path='immutable-signed.pdf' and signed_at is not null),'Old signed history changed';
  filters := '{"designation":"loa","ica":"all","search":"","state":"","joinedAfter":"","joinedBefore":""}';
  select array_agg((r->>'id')::uuid) into recipients from jsonb_array_elements(public.document_request_recipients(filters,'thepncl.com')) r;
  perform public.ensure_onboarding_document_edition(step_id,'loa','10000000-0000-0000-0000-000000000003');
  assert not exists(select 1 from public.portal_document_requests where campaign_id='10000000-0000-0000-0000-000000000003'),'Staged source assigned requests';
  perform public.publish_onboarding_document_rollout(gen_random_uuid(),'00000000-0000-0000-0000-000000000007',step_id,'loa','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',filters,recipients,'portal','current_first','thepncl.com');
  assert (select count(*) from public.portal_document_requests where campaign_id='10000000-0000-0000-0000-000000000003' and released_at is not null)=3,'Current-first stage incomplete';
  assert (select flow_content->'loa'->>'assetId' from public.portal_todos where id=step_id)='10000000-0000-0000-0000-000000000002','Current-first activated onboarding early';
  perform public.select_onboarding_document_edition('10000000-0000-0000-0000-000000000003');
  assert (select count(*) from public.portal_document_requests where campaign_id='10000000-0000-0000-0000-000000000003')=3,'Second stage duplicated requests';
  perform public.publish_onboarding_document_rollout(gen_random_uuid(),'00000000-0000-0000-0000-000000000007',step_id,'loa','10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003',filters,recipients,'portal','onboarding_first','thepncl.com');
  assert (select count(*) from public.portal_document_requests where campaign_id='10000000-0000-0000-0000-000000000004' and released_at is null)=3,'Onboarding-first did not hold all current agents';
  perform public.release_document_current_agents('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007');
  assert (select count(*) from public.portal_document_requests where campaign_id='10000000-0000-0000-0000-000000000004' and released_at is not null)=3,'Explicit second-stage release failed';
  failed:=false;
  begin
    perform public.publish_onboarding_document_rollout(gen_random_uuid(),'00000000-0000-0000-0000-000000000007',step_id,'loa','10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000004',filters||'{"ica":"signed"}',recipients,'portal','together','thepncl.com');
  exception when others then failed:=true; end;
  assert failed,'Narrowed audience was accepted for a required edition';
  update public.portal_todos set flow_content=flow_content||'{"ibo":{"assetId":"10000000-0000-0000-0000-000000000006"}}' where id=step_id;
  assert (select count(*) from public.portal_document_requests where campaign_id='10000000-0000-0000-0000-000000000006')=1,'IBO applicability failed';
  assert not exists(select 1 from public.portal_document_requests where notification_status<>'none'),'Portal-only workflow queued email';
  assert (select md5(string_agg(to_jsonb(s)::text,'' order by user_id)) from public.portal_ica_signatures s)=snapshot,'Historical native signatures changed';
  assert not exists(select 1 from public.portal_document_requests where campaign_id='10000000-0000-0000-0000-000000000000'),'Unrelated addendum was assigned';
  raise notice 'PASS: publication, drafts, full audience, exact editions, history, sequencing, and no-email assertions';
end $$;

-- Match production's text identity column, including legacy non-UUID values.
do $$
declare step_id uuid := '20000000-0000-0000-0000-000000000009';
  exact_asset uuid := '10000000-0000-0000-0000-000000000009';
  future_asset uuid := '10000000-0000-0000-0000-000000000010';
  before_count integer;
begin
  insert into public.onboarding_content_assets values
    (exact_asset,'loa','w9','w9-exact.pdf','w9-exact.pdf',100,repeat('9',64),'00000000-0000-0000-0000-000000000007'),
    (future_asset,'loa','w9','w9-future.pdf','w9-future.pdf',100,repeat('b',64),'00000000-0000-0000-0000-000000000007');
  insert into public.onboarding_records values
    ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),
    ('30000000-0000-0000-0000-000000000002','legacy-pending');
  insert into public.onboarding_contract_signatures values
    ('30000000-0000-0000-0000-000000000001',exact_asset,repeat('9',64),now()),
    ('30000000-0000-0000-0000-000000000002',exact_asset,repeat('9',64),now());
  insert into public.portal_todos values(step_id,'w9_setup','W-9','Test','w9',
    jsonb_build_object('loa',jsonb_build_object('assetId',exact_asset)),true,true,false,now());
  assert (select count(*) from public.portal_document_requests where campaign_id=exact_asset)=2,
    'Text-linked exact signature did not suppress its request';
  assert not exists(select 1 from public.portal_document_requests where campaign_id=exact_asset and user_id='00000000-0000-0000-0000-000000000002'),
    'Exact onboarding signature was reissued';
  perform public.ensure_onboarding_document_edition(step_id,'loa',future_asset);
  update public.portal_document_campaigns set require_existing_agents=false where id=future_asset;
  select count(*) into before_count from public.portal_document_requests;
  update public.portal_todos set flow_content=jsonb_build_object('loa',jsonb_build_object('assetId',future_asset)) where id=step_id;
  assert (select onboarding_enabled from public.portal_document_campaigns where id=future_asset),
    'Future-only edition was not selected for onboarding';
  assert (select count(*) from public.portal_document_requests)=before_count,
    'Future-only publication assigned existing agents';
  update public.portal_todos set published=false where id=step_id;
  update public.portal_todos set published=true where id=step_id;
  assert (select count(*) from public.portal_document_requests)=before_count,
    'Republishing lost future-only preference';
  assert public.assign_required_document_edition(future_asset)=0,
    'Direct assignment ignored future-only preference';
  assert not exists(select 1 from public.portal_document_requests where notification_status<>'none'),
    'Future-only setup queued email';
  raise notice 'PASS: production text IDs, exact signatures, future-only publication and republication, no requests or emails';
end $$;
