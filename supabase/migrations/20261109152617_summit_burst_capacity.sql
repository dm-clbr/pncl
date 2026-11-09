-- Burst preparation: coalesced worker wakeups, larger bounded batches,
-- automatic recovery, and compact snapshots with cursor-based originals.
alter table public.summit_worker add column wake_after timestamptz not null default now();

create function public.summit_accept(p_id uuid, p_client_id uuid, p_question text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare accepted uuid; wake boolean := false;
begin
  accepted := public.summit_submit(p_id,p_client_id,p_question);
  -- Thousands of audience requests still create at most one immediate worker
  -- wake per five seconds; everyone else receives their durable receipt.
  update public.summit_worker set wake_after=now()+interval '5 seconds'
    where id and wake_after <= now() and retry_after <= now()
      and (lease_until is null or lease_until < now());
  wake := found;
  return jsonb_build_object('id',accepted,'wake',wake);
end;
$$;

create or replace function public.summit_claim(p_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare ids uuid[];
begin
  perform 1 from public.summit_worker where id and retry_after <= now()
    and (lease_until is null or lease_until < now()) for update skip locked;
  if not found then return null; end if;
  select array_agg(id order by created_at, id) into ids from
    (select id, created_at from public.summit_questions where group_id is null order by created_at, id limit 100) q;
  if ids is null then return null; end if;
  update public.summit_worker set lease_token=p_token, lease_until=now()+interval '120 seconds', claimed_ids=ids where id;
  return jsonb_build_object(
    'questions', (select jsonb_agg(jsonb_build_object('id',id,'question',question) order by created_at,id) from public.summit_questions where id=any(ids)),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id',id,'question',representative) order by created_at,id) from public.summit_groups),'[]'::jsonb)
  );
end;
$$;

create function public.summit_snapshot_v2(p_known_revision text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare revision text; total bigint; pending bigint; oldest timestamptz; state public.summit_worker;
begin
  select * into state from public.summit_worker where id;
  select count(*),count(*) filter(where group_id is null),min(created_at) filter(where group_id is null),
    md5(concat(count(*),':',max(grouped_at),':',state.last_error,':',state.last_success_at))
    into total,pending,oldest,revision from public.summit_questions;
  if revision = p_known_revision then return jsonb_build_object('unchanged',true,'revision',revision); end if;
  return jsonb_build_object(
    'revision',revision,
    'groups', coalesce((select jsonb_agg(to_jsonb(g) order by g.count desc,g.created_at,g.id) from (
      select g.id,g.representative,g.created_at,count(q.id)::integer as count
      from public.summit_groups g join public.summit_questions q on q.group_id=g.id group by g.id
    ) g),'[]'::jsonb),
    'pending_count',pending,'oldest_pending_at',oldest,'total',total,
    'last_error',state.last_error,'last_success_at',state.last_success_at
  );
end;
$$;

create function public.summit_originals(p_group_id uuid, p_after_time timestamptz default null, p_after_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with page as (
    select id,question,created_at from public.summit_questions
      where group_id is not distinct from p_group_id
      and (p_after_time is null or (created_at,id) > (p_after_time,p_after_id))
      order by created_at,id limit 201
  ), numbered as (select *, row_number() over(order by created_at,id) as n from page)
  select jsonb_build_object(
    'submissions',coalesce(jsonb_agg(jsonb_build_object('id',id,'question',question,'created_at',created_at) order by created_at,id) filter(where n<=200),'[]'::jsonb),
    'has_more',count(*) > 200
  ) from numbered;
$$;

-- The cron wake carries a short-lived, single-use random token. It needs no
-- API key in a migration, browser, or cron command, and cannot expose questions.
create table public.summit_wake_tokens (
  token_hash text primary key,
  expires_at timestamptz not null
);
alter table public.summit_wake_tokens enable row level security;
revoke all on public.summit_wake_tokens from anon, authenticated;
grant all on public.summit_wake_tokens to service_role;
create function public.summit_consume_wake(p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.summit_wake_tokens where token_hash=md5(p_token::text) and expires_at>now();
  return found;
end;
$$;
create function public.summit_dispatch()
returns void language plpgsql security invoker set search_path = '' as $$
declare token uuid := gen_random_uuid();
begin
  delete from public.summit_wake_tokens where expires_at < now();
  if not exists(select 1 from public.summit_questions where group_id is null) then return; end if;
  if not exists(select 1 from public.summit_worker where id and retry_after<=now() and (lease_until is null or lease_until<now())) then return; end if;
  insert into public.summit_wake_tokens values(md5(token::text),now()+interval '2 minutes');
  perform net.http_post(
    url := 'https://dpnajpojbxgsckwrmvnm.supabase.co/functions/v1/summit-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-summit-wake',token::text),
    body := '{}'::jsonb, timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.summit_accept(uuid,uuid,text),public.summit_snapshot_v2(text),public.summit_originals(uuid,timestamptz,uuid),public.summit_consume_wake(uuid),public.summit_dispatch() from public,anon,authenticated;
grant execute on function public.summit_accept(uuid,uuid,text),public.summit_snapshot_v2(text),public.summit_originals(uuid,timestamptz,uuid),public.summit_consume_wake(uuid) to service_role;
-- Existing PNCL production already has both extensions. The guard permits
-- isolated PostgreSQL tests without network access or extension installation.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') then
    perform cron.schedule('pncl-summit-queue','* * * * *','select public.summit_dispatch();');
  end if;
end $$;
