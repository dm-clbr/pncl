create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
-- Native profile mirroring. New private data is never exposed through profile views.
create schema if not exists profile_sync_private;
revoke all on schema profile_sync_private from public,anon,authenticated;
grant usage on schema profile_sync_private to service_role;
create table profile_sync_private.settings (singleton boolean primary key default true check(singleton), enabled boolean not null default false, secret text);
insert into profile_sync_private.settings(singleton) values(true);
create table profile_sync_private.mapping(field text primary key, native_column text, kind text not null);
insert into profile_sync_private.mapping values ('first_name','first_name','name'),
('last_name','last_name','name'),
('phone','phone_number','phone'),
('profile_photo','profile_photo_path','asset'),
('home_address_line1','address_line1','text'),
('home_address_city','address_city','text'),
('home_address_state','address_state','state'),
('home_address_zip','address_zip','zip'),
('home_county','county','text'),
('shirt_size','shirt_size','size'),
('polo_shirt_size','polo_shirt_size','size'),
('hoodie_size','hoodie_size','size'),
('waist_size','waist_size','size'),
('shoe_size','shoe_size','size'),
('business_legal_name',null,'text'),
('business_ein',null,'ein'),
('business_address_line1',null,'text'),
('business_address_city',null,'text'),
('business_address_state',null,'state'),
('business_address_postal',null,'zip'),
('business_website',null,'url'),
('timezone',null,'timezone'),
('npn','npn','npn'),
('state_license_numbers','state_license_numbers','licenses'),
('eo_policy_number','eo_policy_number','text'),
('eo_certificate','eo_certificate_path','asset'),
('drivers_license','drivers_license_path','asset'),
('email_from_name',null,'text'),
('email_reply_to',null,'email'),
('show_on_leaderboard',null,'boolean');
create table profile_sync_private.accounts(user_id uuid primary key references public.portal_profiles(user_id) on delete cascade, peer_id uuid unique, legacy_states text[] not null default '{}', last_error text, checked_at timestamptz not null default now());
create table profile_sync_private.fields(user_id uuid not null references profile_sync_private.accounts(user_id) on delete cascade, field text not null, value jsonb not null default 'null', clock jsonb not null default '{"pncl":0,"leadspply":0}', file jsonb, conflict jsonb, updated_at timestamptz not null default now(), primary key(user_id,field));
create table profile_sync_private.outbox(id uuid primary key default gen_random_uuid(), user_id uuid not null references profile_sync_private.accounts(user_id) on delete cascade, field text not null, value jsonb not null, file jsonb, clock jsonb not null, baseline boolean not null default false, actor uuid, status text not null default 'pending' check(status in ('pending','delivered','conflict','error','superseded')), attempts int not null default 0, next_at timestamptz not null default now(), error text, created_at timestamptz not null default now());
create index profile_sync_outbox_pending on profile_sync_private.outbox(user_id,next_at) where status in ('pending','error');
create table profile_sync_private.receipts(id uuid primary key,user_id uuid not null references profile_sync_private.accounts(user_id) on delete cascade,input jsonb not null,outcome text not null,created_at timestamptz not null default now());
create table profile_sync_private.operations(user_id uuid not null references profile_sync_private.accounts(user_id) on delete cascade,id uuid not null,input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(user_id,id));
-- Only metadata in the operational audit. Payloads/receipts remain service-only.
create table profile_sync_private.audit(id bigint generated always as identity primary key,user_id uuid not null references profile_sync_private.accounts(user_id) on delete cascade,event_id uuid,field text,outcome text,created_at timestamptz not null default now());
alter table profile_sync_private.settings enable row level security;
alter table profile_sync_private.mapping enable row level security;
alter table profile_sync_private.accounts enable row level security;
alter table profile_sync_private.fields enable row level security;
alter table profile_sync_private.outbox enable row level security;
alter table profile_sync_private.receipts enable row level security;
alter table profile_sync_private.operations enable row level security;
alter table profile_sync_private.audit enable row level security;
revoke all on all tables in schema profile_sync_private from public,anon,authenticated;
grant all on all tables in schema profile_sync_private to service_role;
grant usage,select on all sequences in schema profile_sync_private to service_role;

create function profile_sync_private.available(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from auth.users u join public.portal_profiles p on p.user_id=u.id where u.id=p_user and u.deleted_at is null and u.email_confirmed_at is not null and lower(u.email) like '%@thepncl.com' and (u.banned_until is null or u.banned_until<now())) $$;
create function profile_sync_private.join_clock(a jsonb,b jsonb) returns jsonb language sql immutable set search_path='' as $$ select jsonb_build_object('pncl',greatest(coalesce((a->>'pncl')::bigint,0),coalesce((b->>'pncl')::bigint,0)),'leadspply',greatest(coalesce((a->>'leadspply')::bigint,0),coalesce((b->>'leadspply')::bigint,0))) $$;
create function profile_sync_private.dominates(a jsonb,b jsonb) returns boolean language sql immutable set search_path='' as $$ select (a->>'pncl')::bigint >= (b->>'pncl')::bigint and (a->>'leadspply')::bigint >= (b->>'leadspply')::bigint $$;
create function profile_sync_private.normal(p_field text,p_raw jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare v text; begin
  if p_raw is null or p_raw='null'::jsonb then return 'null'; end if;
  if jsonb_typeof(p_raw)='string' then
    v:=btrim(p_raw#>>'{}'); if v='' then return 'null'; end if;
    if p_field='phone' and length(regexp_replace(v,'\D','','g')) in (10,11) then v:='+1'||right(regexp_replace(v,'\D','','g'),10); end if;
    if p_field='business_ein' then v:=replace(v,'-',''); end if;
    return to_jsonb(v);
  end if;
  return p_raw;
end $$;
create function profile_sync_private.asset(p_user uuid,p_field text,p_raw jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare v_path text;v_bucket text;v_version timestamptz; begin
  if p_raw is null or p_raw='null'::jsonb or p_raw='""'::jsonb then return 'null'; end if;
  v_bucket:=case when p_field='profile_photo' then 'portal-profile-photos' else 'portal-profile-documents' end;v_path:=p_raw #>> '{}';
  if v_path not like p_user::text||'/%' or v_path like '%..%' then return jsonb_build_object('invalid_asset',true); end if;
  select updated_at into v_version from storage.objects where bucket_id=v_bucket and name=v_path;
  return jsonb_build_object('system','pncl','bucket',v_bucket,'path',v_path,'version',v_version,'name',split_part(v_path,'/',array_length(string_to_array(v_path,'/'),1)));
end $$;
create function profile_sync_private.record(p_user uuid,p_field text,p_value jsonb,p_baseline boolean default false,p_resolve boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare f profile_sync_private.fields%rowtype;c jsonb; begin
  select * into f from profile_sync_private.fields where user_id=p_user and field=p_field for update;
  p_value:=profile_sync_private.normal(p_field,p_value);
  if found and f.value=p_value and (f.conflict is null or not p_resolve) then return; end if;
  c:=profile_sync_private.join_clock(coalesce(f.clock,'{"pncl":0,"leadspply":0}'),case when p_resolve then f.conflict->'clock' else null end);
  if p_value<>'null'::jsonb or not p_baseline then c:=jsonb_set(c,'{pncl}',to_jsonb((c->>'pncl')::bigint+1)); end if;
  insert into profile_sync_private.fields(user_id,field,value,clock,file) values(p_user,p_field,p_value,c,case when p_value ? 'bucket' then p_value else null end)
  on conflict(user_id,field) do update set value=excluded.value,clock=excluded.clock,file=excluded.file,conflict=case when p_resolve then null else fields.conflict end,updated_at=now();
  if p_value<>'null'::jsonb or not p_baseline then insert into profile_sync_private.outbox(user_id,field,value,file,clock,baseline,actor) values(p_user,p_field,p_value,case when p_value ? 'bucket' then p_value else null end,c,p_baseline,auth.uid()); end if;
end $$;
create function profile_sync_private.initialize(p_user uuid,p_row jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare m record;r jsonb;v jsonb;v_doc public.portal_profile_documents%rowtype; begin
  -- Native row before account row is the common lock order, including trigger calls.
  select to_jsonb(n) into r from public.portal_profiles n where user_id=p_user for update;
  if r is null then raise exception 'account_unavailable'; end if;
  insert into profile_sync_private.accounts(user_id,legacy_states) values(p_user,array(select jsonb_array_elements_text(coalesce(nullif(r->'state_licenses','null'::jsonb),'[]')) except select jsonb_object_keys(coalesce(nullif(r->'state_license_numbers','null'::jsonb),'{}')))) on conflict do nothing;
  perform 1 from profile_sync_private.accounts where user_id=p_user for update;
  r:=coalesce(p_row,r);
  for m in select * from profile_sync_private.mapping loop
    if not exists(select 1 from profile_sync_private.fields where user_id=p_user and field=m.field) then
      v:=case when m.kind='asset' then profile_sync_private.asset(p_user,m.field,r->m.native_column) else coalesce(r->m.native_column,'null') end;
      perform profile_sync_private.record(p_user,m.field,v,true);
    end if;
  end loop;
  for v_doc in select d.* from public.portal_profile_documents d where d.user_id=p_user and not exists(select 1 from profile_sync_private.fields f where f.user_id=p_user and f.field='document:'||d.id) loop
      perform profile_sync_private.record(p_user,'document:'||v_doc.id, jsonb_build_object('system','pncl','bucket','portal-profile-documents','path',v_doc.file_path,'name',v_doc.label,'version',v_doc.created_at),true);
      perform profile_sync_private.record(p_user,'document_label:'||v_doc.id,to_jsonb(v_doc.label),true);
    end loop;
end $$;
create function profile_sync_private.project(p_user uuid,p_field text,p_value jsonb,p_file jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare m record;v jsonb:=p_value;v_claim text;v_result jsonb; begin
  select * into m from profile_sync_private.mapping where field=p_field;
  
  if m.kind='asset' then v:=case when p_value='null'::jsonb then 'null'::jsonb else p_file->'path' end; end if;
  if m.native_column is not null then
    execute format('update public.portal_profiles set updated_at=now(), %1$I=(jsonb_populate_record(null::public.portal_profiles,$1)).%1$I where user_id=$2',m.native_column) using jsonb_build_object(m.native_column,v),p_user;
  end if;
  if p_field='state_license_numbers' then update profile_sync_private.accounts set legacy_states=array(select unnest(legacy_states) except select jsonb_object_keys(coalesce(nullif(p_value,'null'::jsonb),'{}'))) where user_id=p_user; update public.portal_profiles set state_licenses=array(select distinct x from (select unnest(legacy_states) x from profile_sync_private.accounts where user_id=p_user union select jsonb_object_keys(coalesce(nullif(p_value,'null'::jsonb),'{}'))) v order by x) where user_id=p_user; end if;
  if p_field like 'document:%' then
    if p_value='null'::jsonb then delete from public.portal_profile_documents where user_id=p_user and id=substring(p_field from 10)::uuid;
    else insert into public.portal_profile_documents(id,user_id,label,file_path,mime_type,size_bytes) values(substring(p_field from 10)::uuid,p_user,coalesce((select value#>>'{}' from profile_sync_private.fields where user_id=p_user and field='document_label:'||substring(p_field from 10)),p_value->>'name','Document'),p_file->>'path',p_value->>'mime',(p_value->>'bytes')::bigint) on conflict(id) do update set file_path=excluded.file_path,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes where portal_profile_documents.user_id=p_user; end if;
  elsif p_field like 'document_label:%' then update public.portal_profile_documents set label=coalesce(p_value#>>'{}','Document') where user_id=p_user and id=substring(p_field from 16)::uuid; end if;
end $$;
create function profile_sync_private.kick(p_user uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare s profile_sync_private.settings%rowtype; begin
  select * into s from profile_sync_private.settings where singleton;
  if s.enabled and s.secret is not null then
    perform net.http_post(url:='https://dpnajpojbxgsckwrmvnm.supabase.co/functions/v1/profile-sync',headers:=jsonb_build_object('Content-Type','application/json','X-Profile-Sync-Key',s.secret),body:=jsonb_build_object('action',case when p_user is null then 'tick' else 'sync' end,'userId',p_user),timeout_milliseconds:=10000);
  end if;
exception when others then null; -- Durable outbox + minute scheduler are the retry path.
end $$;
create function profile_sync_private.capture() returns trigger language plpgsql security definer set search_path='' as $$
declare m record;r jsonb:=to_jsonb(new);o jsonb;v jsonb;begin
  if current_setting('app.profile_sync_apply',true)='1' then return new; end if;
  if TG_OP='UPDATE' then o:=to_jsonb(old); end if;
  perform profile_sync_private.initialize(new.user_id,coalesce(o,r));
  for m in select * from profile_sync_private.mapping where native_column is not null loop
    if TG_OP='UPDATE' and r->m.native_column is distinct from o->m.native_column then
      v:=case when m.kind='asset' then profile_sync_private.asset(new.user_id,m.field,r->m.native_column) else r->m.native_column end;
      perform profile_sync_private.record(new.user_id,m.field,v);
    end if;
  end loop;
  perform profile_sync_private.kick(new.user_id);
  return new;
end $$;
create trigger profile_sync_capture after insert or update on public.portal_profiles for each row execute function profile_sync_private.capture();
create function profile_sync_private.capture_document() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;v jsonb;begin
  if current_setting('app.profile_sync_apply',true)='1' then return coalesce(new,old); end if;
  if TG_OP='DELETE' then r:=old; else r:=new; end if;
  perform profile_sync_private.initialize(r.user_id);
  v:=case when TG_OP='DELETE' then 'null'::jsonb else jsonb_build_object('system','pncl','bucket','portal-profile-documents','path',r.file_path,'name',r.label,'version',r.created_at) end;
  perform profile_sync_private.record(r.user_id,'document:'||r.id,v);
  if TG_OP<>'DELETE' then perform profile_sync_private.record(r.user_id,'document_label:'||r.id,to_jsonb(r.label)); end if;
  perform profile_sync_private.kick(r.user_id);return coalesce(new,old);
end $$;
create trigger profile_sync_document_capture after insert or update or delete on public.portal_profile_documents for each row execute function profile_sync_private.capture_document();


create function profile_sync_private.bind(p_user uuid,p_peer uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not profile_sync_private.available(p_user) then raise exception 'account_unavailable'; end if;
  
  perform profile_sync_private.initialize(p_user);
  if exists(select 1 from profile_sync_private.accounts where user_id=p_user and peer_id is not null and peer_id<>p_peer) then raise exception 'identity_mismatch'; end if;
  update profile_sync_private.accounts set peer_id=p_peer,checked_at=now() where user_id=p_user;
end $$;
create function profile_sync_private.receive(p_user uuid,p_events jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e jsonb;f profile_sync_private.fields%rowtype;r profile_sync_private.receipts%rowtype;v_outcome text;result jsonb:='[]';v_peer uuid; begin
  perform profile_sync_private.initialize(p_user);
  select peer_id into v_peer from profile_sync_private.accounts where user_id=p_user;
  if not profile_sync_private.available(p_user) or v_peer is null then raise exception 'account_unavailable'; end if;
  if jsonb_array_length(p_events)>100 then raise exception 'invalid_request'; end if;
  for e in select value from jsonb_array_elements(p_events) loop
    if e->>'source'<>'leadspply' or (e->>'user_id')::uuid<>v_peer then raise exception 'invalid_actor'; end if;
    select * into r from profile_sync_private.receipts where id=(e->>'id')::uuid;
    if found then
      if r.user_id<>p_user or r.input<>(e-'file') then raise exception 'event_id_reused'; end if;
      result:=result||jsonb_build_array(jsonb_build_object('id',e->>'id','outcome',r.outcome));continue;
    end if;
    if not exists(select 1 from profile_sync_private.mapping where field=e->>'field') and (e->>'field') !~ '^document(_label)?:[0-9a-f-]{36}$' then raise exception 'field_not_allowed'; end if;
    insert into profile_sync_private.fields(user_id,field) values(p_user,e->>'field') on conflict do nothing;
    select * into f from profile_sync_private.fields where user_id=p_user and field=e->>'field' for update;
    if f.value=e->'value' or (f.value->>'sha256' is not null and f.value->>'sha256'=e->'value'->>'sha256') then
      update profile_sync_private.fields set clock=profile_sync_private.join_clock(clock,e->'clock'),conflict=case when conflict is not null and profile_sync_private.dominates(e->'clock',profile_sync_private.join_clock(clock,conflict->'clock')) then null else conflict end where user_id=p_user and field=f.field;
      v_outcome:='matched';
    elsif profile_sync_private.dominates(f.clock,e->'clock') then v_outcome:='stale';
    elsif ((e->>'baseline')::boolean and f.value<>'null'::jsonb) or not profile_sync_private.dominates(e->'clock',f.clock) or (f.conflict is not null and not profile_sync_private.dominates(e->'clock',f.conflict->'clock')) then
      update profile_sync_private.fields set conflict=jsonb_build_object('value',e->'value','clock',e->'clock','source','leadspply','eventId',e->>'id','file',e->'file'),updated_at=now() where user_id=p_user and field=f.field;
      v_outcome:='conflict';
    else
      perform set_config('app.profile_sync_apply','1',true);
      perform profile_sync_private.project(p_user,f.field,e->'value',e->'file');
      perform set_config('app.profile_sync_apply','0',true);
      update profile_sync_private.fields set value=e->'value',clock=e->'clock',file=e->'file',conflict=null,updated_at=now() where user_id=p_user and field=f.field;
      v_outcome:='applied';
    end if;
    insert into profile_sync_private.receipts(id,user_id,input,outcome) values((e->>'id')::uuid,p_user,e-'file',v_outcome);
    insert into profile_sync_private.audit(user_id,event_id,field,outcome) values(p_user,(e->>'id')::uuid,f.field,v_outcome);
    result:=result||jsonb_build_array(jsonb_build_object('id',e->>'id','outcome',v_outcome));
  end loop;
  return result;
end $$;
create function profile_sync_private.save(p_user uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k text;v jsonb;f profile_sync_private.fields%rowtype;o profile_sync_private.operations%rowtype;result jsonb;conflicts jsonb:='[]';v_resolve boolean;begin
  perform profile_sync_private.initialize(p_user);
  if not profile_sync_private.available(p_user) then raise exception 'account_unavailable'; end if;
  select * into o from profile_sync_private.operations where user_id=p_user and id=(p_request->>'id')::uuid;
  if found then if o.input<>p_request then raise exception 'request_id_reused'; end if;return o.result; end if;
  for k in select jsonb_object_keys(p_request->'changes') loop
    select * into f from profile_sync_private.fields where user_id=p_user and field=k;
    if coalesce(f.clock,'{"pncl":0,"leadspply":0}') is distinct from p_request->'expected'->k or (f.conflict is not null and not coalesce(p_request->'resolve' ? k,false)) then conflicts:=conflicts||to_jsonb(k); end if;
  end loop;
  if jsonb_array_length(conflicts)>0 then result:=jsonb_build_object('outcome','conflict','conflicts',conflicts);
  else
    perform set_config('app.profile_sync_apply','1',true);
    for k,v in select * from jsonb_each(p_request->'changes') loop
      v_resolve:=coalesce(p_request->'resolve' ? k,false);
      perform profile_sync_private.project(p_user,k,v,coalesce(p_request->'files'->k,case when v ? 'bucket' then v end));
      perform profile_sync_private.record(p_user,k,v,false,v_resolve);
      if p_request->'files' ? k then update profile_sync_private.fields set file=p_request->'files'->k where user_id=p_user and field=k; update profile_sync_private.outbox set file=p_request->'files'->k where user_id=p_user and field=k and clock=(select clock from profile_sync_private.fields where user_id=p_user and field=k); end if;
    end loop;
    perform set_config('app.profile_sync_apply','0',true);
    result:=jsonb_build_object('outcome','saved','conflicts','[]'::jsonb);
    perform profile_sync_private.kick(p_user);
  end if;
  insert into profile_sync_private.operations(user_id,id,input,result) values(p_user,(p_request->>'id')::uuid,p_request,result);
  return result;
end $$;
create function public.profile_sync(p_action text,p_user uuid default null,p_body jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;e jsonb; begin
  case p_action
  when 'config' then return (select jsonb_build_object('enabled',enabled,'secret',secret) from profile_sync_private.settings where singleton);
  when 'available' then return to_jsonb(profile_sync_private.available(p_user));
  when 'link' then return null;
  when 'bind' then perform profile_sync_private.bind(p_user,(p_body->>'peer')::uuid);return 'true';
  when 'touch' then update profile_sync_private.accounts set checked_at=now(),last_error=p_body->>'error' where user_id=p_user;return 'true';
  when 'tick_users' then select coalesce(jsonb_agg(user_id),'[]') from (select a.user_id from profile_sync_private.accounts a where profile_sync_private.available(a.user_id) order by a.checked_at limit 6) x into result;return result;
  when 'read' then
    perform profile_sync_private.initialize(p_user);
    return jsonb_build_object('fields',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from profile_sync_private.fields f where user_id=p_user),'pending',(select count(*) from profile_sync_private.outbox where user_id=p_user and status='pending'),'errors',(select count(*) from profile_sync_private.outbox where user_id=p_user and status='error'),'lastError',(select last_error from profile_sync_private.accounts where user_id=p_user),'linked',(select peer_id is not null from profile_sync_private.accounts where user_id=p_user));
  when 'outbox' then
    -- Newest event for a field supersedes earlier unsent values, including file deletions.
    update profile_sync_private.outbox a set status='superseded' where a.user_id=p_user and a.status in ('pending','error') and exists(select 1 from profile_sync_private.outbox b where b.user_id=a.user_id and b.field=a.field and b.id<>a.id and profile_sync_private.dominates(b.clock,a.clock) and b.clock<>a.clock);
    return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from profile_sync_private.outbox where user_id=p_user and status='pending' and next_at<=now() order by created_at,id limit 100) x);
  when 'materialize' then
    update profile_sync_private.outbox set value=p_body->'value' where id=(p_body->>'id')::uuid and user_id=p_user and value ? 'path';
    update profile_sync_private.fields f set value=p_body->'value' from profile_sync_private.outbox e where e.id=(p_body->>'id')::uuid and e.user_id=p_user and f.user_id=p_user and f.field=e.field and f.clock=e.clock;
    return 'true';
  when 'event' then return (select to_jsonb(e) from profile_sync_private.outbox e where id=(p_body->>'id')::uuid and user_id=p_user);
  when 'receive' then return profile_sync_private.receive(p_user,p_body->'events');
  when 'gc_candidates' then return (select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name)),'[]') from (select o.* from storage.objects o where o.bucket_id in ('portal-profile-photos','portal-profile-documents','avatars','profile-sync-documents') and o.name ~ '^[0-9a-f-]{36}/mirror/' and o.updated_at<now()-interval '30 days' and not exists(select 1 from profile_sync_private.fields f where (f.file->>'bucket'=o.bucket_id and f.file->>'path'=o.name) or (f.conflict->'file'->>'bucket'=o.bucket_id and f.conflict->'file'->>'path'=o.name)) and not exists(select 1 from profile_sync_private.outbox e where e.status in ('pending','error') and e.file->>'bucket'=o.bucket_id and e.file->>'path'=o.name) limit 50) o);
  when 'operation' then return (select jsonb_build_object('fingerprint',o.input->>'fingerprint','result',o.result) from profile_sync_private.operations o where o.user_id=p_user and o.id=(p_body->>'id')::uuid);
  when 'save' then return profile_sync_private.save(p_user,p_body);
  when 'ack' then
    for e in select value from jsonb_array_elements(p_body->'receipts') loop
      update profile_sync_private.outbox set status=case when e->>'outcome'='conflict' then 'conflict' else 'delivered' end,error=null where id=(e->>'id')::uuid and user_id=p_user;
    end loop;return 'true';
  when 'fail' then update profile_sync_private.outbox set attempts=attempts+1,status=case when attempts>=9 then 'error' else 'pending' end,next_at=now()+make_interval(secs=>least(3600,10*power(2,least(attempts,8)))::int),error=p_body->>'error' where id=(p_body->>'id')::uuid and user_id=p_user and status='pending';return 'true';
  when 'retry' then update profile_sync_private.outbox set status='pending',attempts=0,next_at=now(),error=null where user_id=p_user and status='error';perform profile_sync_private.kick(p_user);return 'true';
  else raise exception 'invalid_action'; end case;
end $$;

create function profile_sync_private.capture_storage_replace() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid; m record; r jsonb; v jsonb; begin
  if new.updated_at is not distinct from old.updated_at or new.bucket_id not in ('portal-profile-photos','portal-profile-documents','avatars','profile-sync-documents') then return new; end if;
  begin u:=split_part(new.name,'/',1)::uuid; exception when invalid_text_representation then return new; end;
  select to_jsonb(n) into r from public.portal_profiles n where user_id=u;
  if r is null then return new; end if;
  for m in select * from profile_sync_private.mapping where kind='asset' and native_column is not null loop
    v:=profile_sync_private.asset(u,m.field,r->m.native_column);
    if v->>'bucket'=new.bucket_id and v->>'path'=new.name then
      perform profile_sync_private.initialize(u);perform profile_sync_private.record(u,m.field,v);perform profile_sync_private.kick(u);
    end if;
  end loop;
  return new;
end $$;
create trigger profile_sync_storage_replace after update of updated_at on storage.objects for each row execute function profile_sync_private.capture_storage_replace();

revoke all on all functions in schema profile_sync_private from public,anon,authenticated;
grant execute on all functions in schema profile_sync_private to service_role;
revoke all on function public.profile_sync(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.profile_sync(text,uuid,jsonb) to service_role;
-- Files unique to this integration remain private; public photos use existing photo buckets.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-sync-documents','profile-sync-documents',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
-- Service-only counterpart files are served through an authenticated, owner-bound function.
-- Cron is activated separately after both authenticated endpoints pass release checks.
notify pgrst,'reload schema';
