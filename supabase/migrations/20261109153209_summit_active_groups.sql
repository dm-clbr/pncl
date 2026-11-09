-- Empty groups must not influence later questions after maintenance or fixture cleanup.
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
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id',id,'question',representative) order by created_at,id) from public.summit_groups g where exists (select 1 from public.summit_questions q where q.group_id=g.id)),'[]'::jsonb)
  );
end;
$$;
