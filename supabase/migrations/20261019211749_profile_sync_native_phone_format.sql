create or replace function profile_sync_private.project(p_user uuid,p_field text,p_value jsonb,p_file jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare m record;v jsonb:=p_value;v_claim text;v_result jsonb; begin
  select * into m from profile_sync_private.mapping where field=p_field;
  
  if m.kind='asset' then v:=case when p_value='null'::jsonb then 'null'::jsonb else p_file->'path' end; end if;
  -- Sync values use E.164; the native profile preserves its validated display format.
  if p_field='phone' and p_value<>'null'::jsonb then
    v:=to_jsonb(substring(p_value #>> '{}' from 3 for 3)||'-'||substring(p_value #>> '{}' from 6 for 3)||'-'||substring(p_value #>> '{}' from 9 for 4));
  end if;
  if m.native_column is not null then
    execute format('update public.portal_profiles set updated_at=now(), %1$I=(jsonb_populate_record(null::public.portal_profiles,$1)).%1$I where user_id=$2',m.native_column) using jsonb_build_object(m.native_column,v),p_user;
  end if;
  if p_field='state_license_numbers' then update profile_sync_private.accounts set legacy_states=array(select unnest(legacy_states) except select jsonb_object_keys(coalesce(nullif(p_value,'null'::jsonb),'{}'))) where user_id=p_user; update public.portal_profiles set state_licenses=array(select distinct x from (select unnest(legacy_states) x from profile_sync_private.accounts where user_id=p_user union select jsonb_object_keys(coalesce(nullif(p_value,'null'::jsonb),'{}'))) v order by x) where user_id=p_user; end if;
  if p_field like 'document:%' then
    if p_value='null'::jsonb then delete from public.portal_profile_documents where user_id=p_user and id=substring(p_field from 10)::uuid;
    else insert into public.portal_profile_documents(id,user_id,label,file_path,mime_type,size_bytes) values(substring(p_field from 10)::uuid,p_user,coalesce((select value#>>'{}' from profile_sync_private.fields where user_id=p_user and field='document_label:'||substring(p_field from 10)),p_value->>'name','Document'),p_file->>'path',p_value->>'mime',(p_value->>'bytes')::bigint) on conflict(id) do update set file_path=excluded.file_path,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes where portal_profile_documents.user_id=p_user; end if;
  elsif p_field like 'document_label:%' then update public.portal_profile_documents set label=coalesce(p_value#>>'{}','Document') where user_id=p_user and id=substring(p_field from 16)::uuid; end if;
end $$;
