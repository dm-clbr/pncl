-- Preserve the deployed lease protections, including on older checkouts.
-- No user/profile/file data is removed by this migration.
alter table profile_sync_private.accounts
  add column if not exists lease_token uuid,
  add column if not exists lease_until timestamptz not null default '-infinity',
  add column if not exists sync_after timestamptz not null default '-infinity',
  add column if not exists sync_failures integer not null default 0,
  add column if not exists dispatch_after timestamptz not null default '-infinity',
  add column if not exists sync_requested boolean not null default false;
alter table profile_sync_private.settings
  add column if not exists gc_after timestamptz not null default '-infinity';
create index if not exists profile_sync_outbox_due
  on profile_sync_private.outbox(user_id,next_at) where status='pending';

CREATE OR REPLACE FUNCTION profile_sync_private.wake(p_user uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s profile_sync_private.settings%rowtype; payload jsonb; signature text;
begin
  if p_user is null then return; end if;
  select * into s from profile_sync_private.settings where singleton;
  if s.enabled and s.secret is not null then
    if p_user is not null then
      -- Coalesce wake-ups for saved edits; an idle/read-only account is ineligible.
      update profile_sync_private.accounts a set dispatch_after=now()+interval '30 seconds'
        where a.user_id=p_user and a.sync_requested and a.dispatch_after<=now() and a.lease_until<=now() and a.sync_after<=now()
          and exists(select 1 from profile_sync_private.outbox o where o.user_id=a.user_id and o.status='pending' and o.next_at<=now());
      if not found then return; end if;
    end if;
    payload:=jsonb_build_object('action',case when p_user is null then 'tick' else 'sync' end,'userId',p_user,'issuedAt',floor(extract(epoch from clock_timestamp()))::bigint);
    signature:=encode(extensions.hmac(convert_to(payload::text,'UTF8'),convert_to(s.secret,'UTF8'),'sha256'),'hex');
    perform net.http_post(url:='https://dpnajpojbxgsckwrmvnm.supabase.co/functions/v1/profile-sync',headers:=jsonb_build_object('Content-Type','application/json','X-Profile-Sync-Kick',signature),body:=payload,timeout_milliseconds:=10000);
  end if;
exception when others then null; -- The saved outbox remains durable for the next explicit save.
end $function$;

-- Only a committed profile write or an explicit retry requests delivery.
-- Continuations use wake(), so they never reset failed events into a retry loop.
create or replace function profile_sync_private.kick(p_user uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_user is null then return; end if;
  update profile_sync_private.outbox
    set status='pending',attempts=0,next_at=now(),error=null
    where user_id=p_user and status in ('pending','error');
  update profile_sync_private.accounts
    set sync_requested=true,sync_after='-infinity',sync_failures=0,last_error=null,
        dispatch_after=case when lease_until<=now() then '-infinity'::timestamptz else dispatch_after end
    where user_id=p_user
      and exists(select 1 from profile_sync_private.outbox where user_id=p_user and status='pending');
  if found then perform profile_sync_private.wake(p_user); end if;
end $$;

CREATE OR REPLACE FUNCTION profile_sync_private.claim(p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare token uuid;
begin
  -- Serialize admission only. The finishing worker wakes saves that hit capacity.
  perform pg_advisory_xact_lock(20261020,1);
  if (select count(*) from profile_sync_private.accounts where lease_until>now())>=4 then
    update profile_sync_private.accounts set dispatch_after='-infinity'
      where user_id=p_user and sync_requested and lease_until<=now();
    return null;
  end if;
  perform 1 from profile_sync_private.accounts a
    where a.user_id=p_user and a.sync_requested and a.lease_until<=now() and a.sync_after<=now()
      and exists(select 1 from profile_sync_private.outbox o where o.user_id=a.user_id and o.status='pending' and o.next_at<=now())
      and profile_sync_private.available(a.user_id)
    for update skip locked;
  if not found then return null; end if;
  token:=gen_random_uuid();
  update profile_sync_private.accounts set lease_token=token,lease_until=now()+interval '10 minutes',checked_at=now() where user_id=p_user;
  return token;
end $function$;

CREATE OR REPLACE FUNCTION profile_sync_private.finish(p_user uuid, p_token uuid, p_error text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  update profile_sync_private.accounts set lease_token=null,lease_until='-infinity',dispatch_after='-infinity',
    last_error=p_error,checked_at=now(),
    sync_requested=p_error is null and exists(select 1 from profile_sync_private.outbox o where o.user_id=p_user and o.status='pending' and o.next_at<=now()),
    sync_after=case when p_error is null then now() else now()+make_interval(secs=>least(3600,60*power(2,least(sync_failures,6)))::int) end,
    sync_failures=case when p_error is null then 0 else least(sync_failures+1,7) end
    where user_id=p_user and lease_token=p_token;
  if not found then return false; end if;
  return p_error is null and exists(select 1 from profile_sync_private.outbox where user_id=p_user and status='pending' and next_at<=now());
end $function$;

-- Reconcile already-deployed read/trigger protections into migration history.
CREATE OR REPLACE FUNCTION profile_sync_private.initialize(p_user uuid, p_row jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION profile_sync_private.bind(p_user uuid, p_peer uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not profile_sync_private.available(p_user) then raise exception 'account_unavailable'; end if;
  
  if exists(select 1 from profile_sync_private.accounts where user_id=p_user and peer_id=p_peer) then return; end if;
  perform profile_sync_private.initialize(p_user);
  if exists(select 1 from profile_sync_private.accounts where user_id=p_user and peer_id is not null and peer_id<>p_peer) then raise exception 'identity_mismatch'; end if;
  update profile_sync_private.accounts set peer_id=p_peer,checked_at=now(),sync_after='-infinity',sync_failures=0 where user_id=p_user;
end $function$;

CREATE OR REPLACE FUNCTION profile_sync_private.capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m record;r jsonb:=to_jsonb(new);o jsonb;v jsonb;begin
  if current_setting('app.profile_sync_apply',true)='1' then return new; end if;
  if TG_OP='UPDATE' then
    o:=to_jsonb(old);
    if not exists(select 1 from profile_sync_private.mapping where native_column is not null and r->native_column is distinct from o->native_column) then return new; end if;
  end if;
  perform profile_sync_private.initialize(new.user_id,coalesce(o,r));
  for m in select * from profile_sync_private.mapping where native_column is not null loop
    if TG_OP='UPDATE' and r->m.native_column is distinct from o->m.native_column then
      v:=case when m.kind='asset' then profile_sync_private.asset(new.user_id,m.field,r->m.native_column) else r->m.native_column end;
      perform profile_sync_private.record(new.user_id,m.field,v);
    end if;
  end loop;
  perform profile_sync_private.kick(new.user_id);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION profile_sync_private.capture_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;v jsonb;begin
  if current_setting('app.profile_sync_apply',true)='1' then return coalesce(new,old); end if;
  if TG_OP='DELETE' then r:=old; else r:=new; end if;
  perform profile_sync_private.initialize(r.user_id);
  v:=case when TG_OP='DELETE' then 'null'::jsonb else jsonb_build_object('system','pncl','bucket','portal-profile-documents','path',r.file_path,'name',r.label,'version',r.created_at) end;
  perform profile_sync_private.record(r.user_id,'document:'||r.id,v);
  if TG_OP<>'DELETE' then perform profile_sync_private.record(r.user_id,'document_label:'||r.id,to_jsonb(r.label)); end if;
  perform profile_sync_private.kick(r.user_id);return coalesce(new,old);
end $function$;

CREATE OR REPLACE FUNCTION public.profile_sync(p_action text, p_user uuid DEFAULT NULL::uuid, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb;e jsonb; begin
  case p_action
  when 'dispatch' then perform profile_sync_private.wake(p_user);return 'true';
  when 'config' then return (select jsonb_build_object('enabled',enabled,'secret',secret) from profile_sync_private.settings where singleton);
  when 'available' then return to_jsonb(profile_sync_private.available(p_user));
  when 'link' then return null;
  when 'bind' then perform profile_sync_private.bind(p_user,(p_body->>'peer')::uuid);return 'true';
  when 'touch' then update profile_sync_private.accounts set checked_at=now(),last_error=p_body->>'error' where user_id=p_user;return 'true';
  when 'claim' then return to_jsonb(profile_sync_private.claim(p_user));
  when 'finish' then return to_jsonb(profile_sync_private.finish(p_user,(p_body->>'token')::uuid,p_body->>'error'));
  when 'tick_users' then return '[]';
  when 'ready_users' then
    if (select count(*) from profile_sync_private.accounts where lease_until>now())>=4 then return '[]'; end if;
    select coalesce(jsonb_agg(user_id),'[]') into result from (
      select a.user_id from profile_sync_private.accounts a
      where a.sync_requested and a.lease_until<=now() and a.sync_after<=now() and a.dispatch_after<=now()
        and exists(select 1 from profile_sync_private.outbox o where o.user_id=a.user_id and o.status='pending' and o.next_at<=now())
        and profile_sync_private.available(a.user_id)
      order by a.checked_at,a.user_id limit 4
    ) x;return result;
  when 'read' then
    -- Refreshes must not lock or rewrite an already initialized native profile.
    if not exists(select 1 from profile_sync_private.accounts where user_id=p_user)
      or exists(select 1 from profile_sync_private.mapping m where not exists(select 1 from profile_sync_private.fields f where f.user_id=p_user and f.field=m.field)) then
      perform profile_sync_private.initialize(p_user);
    end if;
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
  when 'gc_candidates' then
    update profile_sync_private.settings set gc_after=now()+interval '1 hour' where singleton and gc_after<=now();
    if not found then return '[]'; end if;
    return (select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name)),'[]') from (select o.* from storage.objects o where o.bucket_id in ('portal-profile-photos','portal-profile-documents','avatars','profile-sync-documents') and o.name ~ '^[0-9a-f-]{36}/mirror/' and o.updated_at<now()-interval '30 days' and not exists(select 1 from profile_sync_private.fields f where (f.file->>'bucket'=o.bucket_id and f.file->>'path'=o.name) or (f.conflict->'file'->>'bucket'=o.bucket_id and f.conflict->'file'->>'path'=o.name)) and not exists(select 1 from profile_sync_private.outbox e where e.status in ('pending','error') and e.file->>'bucket'=o.bucket_id and e.file->>'path'=o.name) limit 50) o);
  when 'operation' then return (select jsonb_build_object('fingerprint',o.input->>'fingerprint','result',o.result) from profile_sync_private.operations o where o.user_id=p_user and o.id=(p_body->>'id')::uuid);
  when 'save' then return profile_sync_private.save(p_user,p_body);
  when 'ack' then
    for e in select value from jsonb_array_elements(p_body->'receipts') loop
      update profile_sync_private.outbox set status=case when e->>'outcome'='conflict' then 'conflict' else 'delivered' end,error=null where id=(e->>'id')::uuid and user_id=p_user;
    end loop;return 'true';
  when 'fail' then update profile_sync_private.outbox set attempts=attempts+1,status='error',next_at=now(),error=p_body->>'error' where id=(p_body->>'id')::uuid and user_id=p_user and status='pending';return 'true';
  when 'retry' then perform profile_sync_private.kick(p_user);return 'true';
  else raise exception 'invalid_action'; end case;
end $function$;

revoke all on function public.profile_sync(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.profile_sync(text,uuid,jsonb) to service_role;
revoke all on all functions in schema profile_sync_private from public,anon,authenticated;
grant execute on all functions in schema profile_sync_private to service_role;

-- Keep job history and make the operational change reversible.
do $$
declare job record;
begin
  if to_regclass('cron.job') is not null then
    for job in select jobid from cron.job
      where command ~ '^\s*select\s+profile_sync_private\.kick\(\)\s*;?\s*$'
    loop
      perform cron.alter_job(job.jobid,active:=false);
    end loop;
  end if;
end $$;

