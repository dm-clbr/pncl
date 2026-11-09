-- A request can commit after a newer request. Group originals therefore page
-- by grouping time (the serialized commit order), not audience creation time.
create index summit_questions_group_cursor_idx on public.summit_questions(group_id,grouped_at,id);
create or replace function public.summit_originals(p_group_id uuid, p_after_time timestamptz default null, p_after_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with page as (
    select id,question,created_at,coalesce(grouped_at,created_at) as cursor_at from public.summit_questions
      where group_id is not distinct from p_group_id
      and (p_after_time is null or (coalesce(grouped_at,created_at),id) > (p_after_time,p_after_id))
      order by coalesce(grouped_at,created_at),id limit 201
  ), numbered as (select *, row_number() over(order by cursor_at,id) as n from page)
  select jsonb_build_object(
    'submissions',coalesce(jsonb_agg(jsonb_build_object('id',id,'question',question,'created_at',created_at,'cursor_at',cursor_at) order by cursor_at,id) filter(where n<=200),'[]'::jsonb),
    'has_more',count(*) > 200
  ) from numbered;
$$;
