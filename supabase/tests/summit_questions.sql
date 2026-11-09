-- Run against a newly migrated database before admitting live questions.
-- Everything is rolled back, including worker claims and test submissions.
begin;
do $$
declare client uuid := gen_random_uuid(); ids uuid[]; token uuid := gen_random_uuid();
  claim jsonb; snapshot jsonb; assignments jsonb; g1 uuid := gen_random_uuid(); g2 uuid := gen_random_uuid();
  page jsonb; cursor_time timestamptz; cursor_id uuid; loaded integer := 0;
begin
  if exists(select 1 from public.summit_questions) then raise exception 'Use an empty Summit database for this isolated test'; end if;
  ids := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  for i in 1..6 loop perform public.summit_submit(ids[i],client,'Original submission '||i||'?'); end loop;
  perform public.summit_submit(ids[1],client,'Original submission 1?');
  if (select count(*) from public.summit_questions) <> 6 then raise exception 'Retry counted twice'; end if;
  begin
    perform public.summit_submit(ids[1],client,'A changed question?');
    raise exception 'Accepted changed idempotency payload';
  exception when raise_exception then if SQLERRM <> 'submission_conflict' then raise; end if; end;
  claim := public.summit_claim(token);
  if jsonb_array_length(claim->'questions') <> 6 then raise exception 'Missing queued originals'; end if;
  if public.summit_claim(gen_random_uuid()) is not null then raise exception 'Concurrent worker acquired lease'; end if;
  begin
    perform public.summit_finish(token,'[]'::jsonb);
    raise exception 'Accepted incomplete model output';
  exception when raise_exception then if SQLERRM <> 'incomplete_assignments' then raise; end if; end;
  select jsonb_agg(jsonb_build_object('question_id',id,'group_id',case when n <= 2 then g1 when n <= 4 then g2 else gen_random_uuid() end))
    into assignments from unnest(ids) with ordinality as q(id,n);
  perform public.summit_finish(token,assignments);
  snapshot := public.summit_snapshot_v2();
  if (snapshot->>'total')::int <> 6 or jsonb_array_length(snapshot->'groups') <> 4 or (snapshot->>'pending_count')::int <> 0 then raise exception 'Snapshot lost questions or groups'; end if;
  if (snapshot->'groups'->0->>'count')::int <> 2 or (snapshot->'groups'->3->>'count')::int <> 1 then raise exception 'Rank ordering incorrect'; end if;
  if (snapshot->'groups'->0) ? 'submissions' then raise exception 'Snapshot unnecessarily includes originals'; end if;
  if (public.summit_snapshot_v2(snapshot->>'revision')->>'unchanged')::boolean is not true then raise exception 'Unchanged snapshot not compact'; end if;
  -- Prove the JSON snapshot is not silently truncated by REST's 1000-row limit.
  insert into public.summit_questions(id,client_id,question,group_id,grouped_at)
    select gen_random_uuid(),client,'Original preserved at scale '||n,g1,now() from generate_series(1,1005) n;
  snapshot := public.summit_snapshot_v2();
  if (snapshot->'groups'->0->>'count')::int <> 1007 then raise exception 'Counts truncated'; end if;
  loop
    page := public.summit_originals(g1,cursor_time,cursor_id);
    loaded := loaded+jsonb_array_length(page->'submissions');
    exit when not (page->>'has_more')::boolean;
    cursor_time := (page->'submissions'->-1->>'cursor_at')::timestamptz;
    cursor_id := (page->'submissions'->-1->>'id')::uuid;
  end loop;
  if loaded <> 1007 then raise exception 'Originals truncated'; end if;
  if has_table_privilege('anon','public.summit_questions','select') or has_table_privilege('authenticated','public.summit_questions','select') then raise exception 'Originals are exposed'; end if;
  if has_function_privilege('anon','public.summit_submit(uuid,uuid,text)','execute') or has_function_privilege('authenticated','public.summit_snapshot_v2(text)','execute') then raise exception 'RPC bypass exposed'; end if;
end;
$$;
rollback;
