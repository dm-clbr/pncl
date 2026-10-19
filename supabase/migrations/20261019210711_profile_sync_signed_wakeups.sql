-- Keep the long-lived credential out of managed pg_net queue rows.
create or replace function profile_sync_private.kick(p_user uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare s profile_sync_private.settings%rowtype; payload jsonb; signature text;
begin
  select * into s from profile_sync_private.settings where singleton;
  if s.enabled and s.secret is not null then
    payload:=jsonb_build_object('action',case when p_user is null then 'tick' else 'sync' end,'userId',p_user,'issuedAt',floor(extract(epoch from clock_timestamp()))::bigint);
    signature:=encode(extensions.hmac(convert_to(payload::text,'UTF8'),convert_to(s.secret,'UTF8'),'sha256'),'hex');
    perform net.http_post(url:='https://dpnajpojbxgsckwrmvnm.supabase.co/functions/v1/profile-sync',headers:=jsonb_build_object('Content-Type','application/json','X-Profile-Sync-Kick',signature),body:=payload,timeout_milliseconds:=10000);
  end if;
exception when others then null; -- Outbox remains durable; cron retries.
end $$;
revoke all on function profile_sync_private.kick(uuid) from public,anon,authenticated;
grant execute on function profile_sync_private.kick(uuid) to service_role;
