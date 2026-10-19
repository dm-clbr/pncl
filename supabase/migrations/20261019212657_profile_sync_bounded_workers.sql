-- One account per queued request; preserve service-only access.
create or replace function public.profile_sync(p_action text,p_user uuid default null,p_body jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;e jsonb; begin
  case p_action
  when 'dispatch' then perform profile_sync_private.kick(p_user);return 'true';
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
revoke all on function public.profile_sync(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.profile_sync(text,uuid,jsonb) to service_role;
