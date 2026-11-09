-- Summit is anonymous to submit, and uses the existing full-admin portal to read.
-- All data access is mediated by Edge Functions; never expose originals publicly.
create table public.summit_groups (
  id uuid primary key,
  representative text not null check (char_length(representative) between 5 and 1000),
  created_at timestamptz not null default now()
);
create table public.summit_questions (
  id uuid primary key,
  client_id uuid not null,
  question text not null check (char_length(btrim(question)) >= 5 and char_length(question) <= 1000),
  created_at timestamptz not null default now(),
  group_id uuid references public.summit_groups(id),
  grouped_at timestamptz
);
create index summit_questions_pending_idx on public.summit_questions(created_at, id) where group_id is null;
create index summit_questions_group_idx on public.summit_questions(group_id, created_at, id);
create index summit_questions_client_idx on public.summit_questions(client_id, created_at);
create table public.summit_worker (
  id boolean primary key default true check (id),
  lease_token uuid,
  lease_until timestamptz,
  claimed_ids uuid[] not null default '{}',
  retry_after timestamptz not null default now(),
  last_error text,
  last_success_at timestamptz
);
insert into public.summit_worker(id) values (true);
alter table public.summit_questions enable row level security;
alter table public.summit_groups enable row level security;
alter table public.summit_worker enable row level security;
revoke all on public.summit_questions, public.summit_groups, public.summit_worker from anon, authenticated;
grant all on public.summit_questions, public.summit_groups, public.summit_worker to service_role;

create function public.summit_submit(p_id uuid, p_client_id uuid, p_question text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare existing public.summit_questions;
begin
  if p_id is null or p_client_id is null or p_question is null or char_length(btrim(p_question)) < 5 or char_length(p_question) > 1000 then
    raise exception 'invalid_question';
  end if;
  -- Retries of the same submission cannot inflate the count, even concurrently.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into existing from public.summit_questions where id = p_id;
  if found then
    if existing.client_id <> p_client_id or existing.question <> p_question then raise exception 'submission_conflict'; end if;
    return p_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 1));
  if (select count(*) from public.summit_questions where client_id = p_client_id and created_at > now() - interval '1 minute') >= 8 then
    raise exception 'rate_limited';
  end if;
  insert into public.summit_questions(id, client_id, question) values (p_id, p_client_id, p_question);
  return p_id;
end;
$$;

create function public.summit_claim(p_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare ids uuid[];
begin
  -- One semantic writer at a time prevents equivalent simultaneous submissions
  -- from creating competing groups. An expired lease is recoverable.
  perform 1 from public.summit_worker where id and retry_after <= now()
    and (lease_until is null or lease_until < now()) for update skip locked;
  if not found then return null; end if;
  select array_agg(id order by created_at, id) into ids from
    (select id, created_at from public.summit_questions where group_id is null order by created_at, id limit 20) q;
  if ids is null then return null; end if;
  update public.summit_worker set lease_token=p_token, lease_until=now()+interval '120 seconds', claimed_ids=ids where id;
  return jsonb_build_object(
    'questions', (select jsonb_agg(jsonb_build_object('id',id,'question',question) order by created_at,id) from public.summit_questions where id=any(ids)),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id',id,'question',representative) order by created_at,id) from public.summit_groups),'[]'::jsonb)
  );
end;
$$;

create function public.summit_finish(p_token uuid, p_assignments jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare state public.summit_worker; item record; assigned uuid[];
begin
  select * into state from public.summit_worker where id for update;
  if state.lease_token is distinct from p_token or state.lease_until <= now() then raise exception 'stale_lease'; end if;
  select array_agg(x.question_id) into assigned from jsonb_to_recordset(p_assignments) as x(question_id uuid, group_id uuid);
  if assigned is null or cardinality(assigned) <> cardinality(state.claimed_ids)
    or not assigned @> state.claimed_ids or not assigned <@ state.claimed_ids
    or (select count(distinct x) from unnest(assigned) x) <> cardinality(assigned)
  then raise exception 'incomplete_assignments'; end if;
  for item in select x.question_id, x.group_id from jsonb_to_recordset(p_assignments) as x(question_id uuid, group_id uuid) loop
    if item.group_id is null then raise exception 'invalid_group'; end if;
    -- The representative is always an original submission, never invented text.
    insert into public.summit_groups(id, representative)
      select item.group_id, question from public.summit_questions where id=item.question_id
      on conflict (id) do nothing;
    update public.summit_questions set group_id=item.group_id, grouped_at=now()
      where id=item.question_id and group_id is null;
    if not found then raise exception 'already_grouped'; end if;
  end loop;
  update public.summit_worker set lease_token=null, lease_until=null, claimed_ids='{}', last_error=null, last_success_at=now(), retry_after=now() where id;
end;
$$;

create function public.summit_fail(p_token uuid, p_error text)
returns void language sql security invoker set search_path = '' as $$
  update public.summit_worker set lease_token=null, lease_until=null, claimed_ids='{}', last_error=left(p_error,160), retry_after=now()+interval '30 seconds'
    where id and lease_token=p_token;
$$;

-- A single snapshot prevents torn counts and bypasses REST's default row cap.
-- There is intentionally no LIMIT on groups or on a group's originals.
create function public.summit_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'groups', coalesce((select jsonb_agg(to_jsonb(g) order by g.count desc,g.created_at,g.id) from (
      select g.id,g.representative,g.created_at,count(q.id)::integer as count,
        jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'created_at',q.created_at) order by q.created_at,q.id) as submissions
      from public.summit_groups g join public.summit_questions q on q.group_id=g.id group by g.id
    ) g),'[]'::jsonb),
    'pending', coalesce((select jsonb_agg(jsonb_build_object('id',id,'question',question,'created_at',created_at) order by created_at,id)
      from public.summit_questions where group_id is null),'[]'::jsonb),
    'total', (select count(*) from public.summit_questions),
    'last_error', (select last_error from public.summit_worker where id),
    'last_success_at', (select last_success_at from public.summit_worker where id)
  );
$$;
revoke all on function public.summit_submit(uuid,uuid,text), public.summit_claim(uuid), public.summit_finish(uuid,jsonb), public.summit_fail(uuid,text), public.summit_snapshot() from public, anon, authenticated;
grant execute on function public.summit_submit(uuid,uuid,text), public.summit_claim(uuid), public.summit_finish(uuid,jsonb), public.summit_fail(uuid,text), public.summit_snapshot() to service_role;
