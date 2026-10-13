-- Separate from the agent-editable profile: designation changes are admin-only.
-- No backfill: existing agents keep the current LOA flow until designated IBO.
create table public.portal_agent_designations (
  user_id uuid primary key references public.portal_profiles(user_id) on delete cascade,
  designation text not null check (designation in ('loa', 'ibo')),
  updated_at timestamptz not null default now()
);

alter table public.portal_agent_designations enable row level security;
revoke all on table public.portal_agent_designations from anon, authenticated;
grant select on table public.portal_agent_designations to authenticated;
grant all on table public.portal_agent_designations to service_role;

create policy "Agents can read own designation"
  on public.portal_agent_designations for select to authenticated
  using ((select auth.uid()) = user_id);

create trigger portal_agent_designations_updated_at
  before update on public.portal_agent_designations
  for each row execute function public.set_updated_at();
