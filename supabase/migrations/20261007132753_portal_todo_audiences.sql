-- Keep current LOA/IBO behavior; future steps default to both audiences.
alter table public.portal_todos
  add column show_loa boolean not null default true,
  add column show_ibo boolean not null default true;
update public.portal_todos set show_ibo = false
where slug in ('w9_setup', 'direct_deposit_setup', 'comp_agreement');

-- Admin-only writes are made through authenticated Edge Functions.
revoke insert, update, delete on table public.portal_todos from anon, authenticated;

-- Save all changed rows atomically, without touching content or completion data.
create function public.set_portal_todo_audiences(settings jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  entry jsonb;
  updated_count integer;
begin
  if jsonb_typeof(settings) is distinct from 'array' then
    raise exception 'Settings must be an array';
  end if;
  if jsonb_array_length(settings) < 1 or jsonb_array_length(settings) > 500 then
    raise exception 'Save between 1 and 500 onboarding steps';
  end if;
  for entry in select value from jsonb_array_elements(settings) loop
    if jsonb_typeof(entry) is distinct from 'object'
      or jsonb_typeof(entry->'id') is distinct from 'string'
      or (entry->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(entry->'show_loa') is distinct from 'boolean'
      or jsonb_typeof(entry->'show_ibo') is distinct from 'boolean' then
      raise exception 'Invalid onboarding step selection';
    end if;
  end loop;
  if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(settings)) <> jsonb_array_length(settings) then
    raise exception 'Duplicate onboarding step';
  end if;
  update public.portal_todos as todo
    set show_loa = selected.show_loa, show_ibo = selected.show_ibo, updated_at = now()
    from jsonb_to_recordset(settings) as selected(id uuid, show_loa boolean, show_ibo boolean)
    where todo.id = selected.id;
  get diagnostics updated_count = row_count;
  if updated_count <> jsonb_array_length(settings) then
    raise exception 'An onboarding step no longer exists. Reload and try again';
  end if;
end;
$$;
revoke all on function public.set_portal_todo_audiences(jsonb) from public, anon, authenticated;
grant execute on function public.set_portal_todo_audiences(jsonb) to service_role;
