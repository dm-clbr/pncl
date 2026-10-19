-- Automatic per-field latest-save sync. No native tables or files are deleted.
-- Existing events/receipts retain the previous values and their audit history.
insert into profile_sync_private.mapping(field,native_column,kind) values('close_out_song',null,'song');

alter table profile_sync_private.fields add column write_version jsonb;
alter table profile_sync_private.outbox add column write_version jsonb;

update profile_sync_private.outbox set write_version=jsonb_build_object(
  'at',created_at,'source','pncl','id',id,'baseline',baseline) where write_version is null;
-- Recover each local value's original save order, not the time of deployment.
update profile_sync_private.fields f set write_version=(
  select e.write_version from profile_sync_private.outbox e
  where e.user_id=f.user_id and e.field=f.field and e.value=f.value
  order by e.created_at desc,e.id desc limit 1) where f.write_version is null;
-- A received value may have no local event. Old receipts predate save timestamps.
-- Keep its last known application time until a timestamped event arrives.
update profile_sync_private.fields f set write_version=jsonb_build_object(
  'at',f.updated_at,'source','leadspply','id','00000000-0000-0000-0000-000000000000',
  'baseline',true) where write_version is null;

create or replace function profile_sync_private.newer(a jsonb,b jsonb)
returns boolean language sql immutable set search_path='' as $$
  select case when b is null then true else
    row(not (a->>'baseline')::boolean,(a->>'at')::timestamptz,a->>'source',(a->>'id')::uuid) >
    row(not (b->>'baseline')::boolean,(b->>'at')::timestamptz,b->>'source',(b->>'id')::uuid)
  end
$$;

create or replace function profile_sync_private.record(p_user uuid,p_field text,p_value jsonb,p_baseline boolean default false,p_resolve boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare f profile_sync_private.fields%rowtype;c jsonb;v jsonb;event_id uuid:=gen_random_uuid();saved_at timestamptz;
begin
  select * into f from profile_sync_private.fields where user_id=p_user and field=p_field for update;
  p_value:=profile_sync_private.normal(p_field,p_value);
  if found and f.value=p_value and f.conflict is null and not p_resolve then return; end if;
  c:=profile_sync_private.join_clock(coalesce(f.clock,'{"pncl":0,"leadspply":0}'),f.conflict->'clock');
  if p_value<>'null'::jsonb or not p_baseline then c:=jsonb_set(c,'{pncl}',to_jsonb((c->>'pncl')::bigint+1)); end if;
  -- Use database time and advance past any already-observed remote save.
  saved_at:=greatest(clock_timestamp(),(f.write_version->>'at')::timestamptz+interval '1 microsecond');
  v:=jsonb_build_object('at',saved_at,'source','pncl','id',event_id,'baseline',p_baseline);
  insert into profile_sync_private.fields(user_id,field,value,clock,file,write_version)
  values(p_user,p_field,p_value,c,case when p_value ? 'bucket' then p_value else null end,v)
  on conflict(user_id,field) do update set value=excluded.value,clock=excluded.clock,
    file=excluded.file,conflict=null,write_version=excluded.write_version,updated_at=clock_timestamp();
  if p_value<>'null'::jsonb or not p_baseline then
    insert into profile_sync_private.outbox(id,user_id,field,value,file,clock,baseline,actor,created_at,write_version)
    values(event_id,p_user,p_field,p_value,case when p_value ? 'bucket' then p_value else null end,c,p_baseline,auth.uid(),saved_at,v);
  end if;
end $$;

create or replace function profile_sync_private.save(p_user uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare k text;v jsonb;o profile_sync_private.operations%rowtype;result jsonb;
begin
  perform profile_sync_private.initialize(p_user);
  if not profile_sync_private.available(p_user) then raise exception 'account_unavailable'; end if;
  select * into o from profile_sync_private.operations where user_id=p_user and id=(p_request->>'id')::uuid;
  if found then if o.input<>p_request then raise exception 'request_id_reused'; end if;return o.result; end if;
  -- A deliberate save replaces the submitted fields even from an older form.
  -- Expected clocks remain accepted for older clients; no review is required.
  perform set_config('app.profile_sync_apply','1',true);
  for k,v in select * from jsonb_each(p_request->'changes') loop
    if not exists(select 1 from profile_sync_private.mapping where field=k) and k !~ '^document(_label)?:[0-9a-f-]{36}$' then raise exception 'field_not_allowed'; end if;
    perform profile_sync_private.project(p_user,k,v,coalesce(p_request->'files'->k,case when v ? 'bucket' then v end));
    perform profile_sync_private.record(p_user,k,v,false,true);
    if p_request->'files' ? k then
      update profile_sync_private.fields set file=p_request->'files'->k where user_id=p_user and field=k;
      update profile_sync_private.outbox set file=p_request->'files'->k where user_id=p_user and field=k and clock=(select clock from profile_sync_private.fields where user_id=p_user and field=k);
    end if;
  end loop;
  perform set_config('app.profile_sync_apply','0',true);
  result:=jsonb_build_object('outcome','saved','conflicts','[]'::jsonb);
  insert into profile_sync_private.operations(user_id,id,input,result) values(p_user,(p_request->>'id')::uuid,p_request,result);
  perform profile_sync_private.kick(p_user);
  return result;
end $$;

create or replace function profile_sync_private.receive(p_user uuid,p_events jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e jsonb;f profile_sync_private.fields%rowtype;r profile_sync_private.receipts%rowtype;
  v_outcome text;result jsonb:='[]';v_peer uuid;wins boolean;matched boolean;
begin
  perform profile_sync_private.initialize(p_user);
  select peer_id into v_peer from profile_sync_private.accounts where user_id=p_user;
  if not profile_sync_private.available(p_user) or v_peer is null then raise exception 'account_unavailable'; end if;
  if jsonb_array_length(p_events)>100 then raise exception 'invalid_request'; end if;
  for e in select value from jsonb_array_elements(p_events) loop
    if e->>'source'<>'leadspply' or (e->>'user_id')::uuid<>v_peer then raise exception 'invalid_actor'; end if;
    select * into r from profile_sync_private.receipts where id=(e->>'id')::uuid;
    if found then
      if r.user_id<>p_user or (case when r.input ? 'write_version' then r.input<>(e-'file') else r.input<>(e-'file'-'write_version') end) then raise exception 'event_id_reused'; end if;
      result:=result||jsonb_build_array(jsonb_build_object('id',e->>'id','outcome',r.outcome));continue;
    end if;
    if not exists(select 1 from profile_sync_private.mapping where field=e->>'field') and (e->>'field') !~ '^document(_label)?:[0-9a-f-]{36}$' then raise exception 'field_not_allowed'; end if;
    -- Timestamped delivery is mandatory. Old workers retry after both upgrades.
    if e->'write_version' is null or coalesce(e->'write_version'->>'source','') not in ('pncl','leadspply') or
       (e->'write_version'->>'at')::timestamptz is null or
       (e->'write_version'->>'id')::uuid is null or
       jsonb_typeof(e->'write_version'->'baseline') is distinct from 'boolean' then raise exception 'invalid_event'; end if;
    insert into profile_sync_private.fields(user_id,field) values(p_user,e->>'field') on conflict do nothing;
    select * into f from profile_sync_private.fields where user_id=p_user and field=e->>'field' for update;
    matched:=f.value=e->'value' or (f.value->>'sha256' is not null and f.value->>'sha256'=e->'value'->>'sha256');
    wins:=profile_sync_private.newer(e->'write_version',f.write_version)
      or (f.value='null'::jsonb and coalesce((f.write_version->>'baseline')::boolean,true) and e->'value'<>'null'::jsonb);
    if wins then
      if not matched then
        perform set_config('app.profile_sync_apply','1',true);
        perform profile_sync_private.project(p_user,f.field,e->'value',e->'file');
        perform set_config('app.profile_sync_apply','0',true);
      end if;
      update profile_sync_private.fields set value=case when matched then value else e->'value' end,
        file=case when matched then file else e->'file' end,write_version=e->'write_version',updated_at=clock_timestamp()
        where user_id=p_user and field=f.field;
      v_outcome:=case when matched then 'matched' else 'applied' end;
    else v_outcome:=case when matched then 'matched' else 'stale' end;
    end if;
    update profile_sync_private.fields set clock=profile_sync_private.join_clock(clock,e->'clock'),conflict=null where user_id=p_user and field=f.field;
    insert into profile_sync_private.receipts(id,user_id,input,outcome) values((e->>'id')::uuid,p_user,e-'file',v_outcome);
    insert into profile_sync_private.audit(user_id,event_id,field,outcome) values(p_user,(e->>'id')::uuid,f.field,v_outcome);
    result:=result||jsonb_build_array(jsonb_build_object('id',e->>'id','outcome',v_outcome));
  end loop;
  return result;
end $$;

-- Reconsider existing differences using their original local save order.
-- Fresh transport IDs avoid replaying old conflict receipts. History is retained.
do $$
declare f profile_sync_private.fields%rowtype;c jsonb;
begin
  for f in select * from profile_sync_private.fields where conflict is not null for update loop
    c:=profile_sync_private.join_clock(f.clock,f.conflict->'clock');
    c:=jsonb_set(c,'{pncl}',to_jsonb((c->>'pncl')::bigint+1));
    update profile_sync_private.outbox set status='superseded' where user_id=f.user_id and field=f.field and status in ('pending','error','conflict');
    update profile_sync_private.fields set clock=c,conflict=null where user_id=f.user_id and field=f.field;
    insert into profile_sync_private.outbox(user_id,field,value,file,clock,baseline,write_version)
    values(f.user_id,f.field,f.value,f.file,c,(f.write_version->>'baseline')::boolean,f.write_version);
  end loop;
end $$;
revoke all on all functions in schema profile_sync_private from public,anon,authenticated;
grant execute on all functions in schema profile_sync_private to service_role;
notify pgrst,'reload schema';
