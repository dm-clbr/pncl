-- Internal admin-only designations for an agent (lead assist / funding source).
-- Deliberately kept out of portal_profiles: agents can read and update their own
-- profile row through RLS, and these flags must never be visible to them.
-- Access goes through service-role edge functions only.
create table if not exists portal_agent_flags (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lead_assist boolean not null default false,
  company_funded boolean not null default false,
  jeremy_funded boolean not null default false,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table portal_agent_flags enable row level security;

drop trigger if exists portal_agent_flags_updated_at on portal_agent_flags;
create trigger portal_agent_flags_updated_at
before update on portal_agent_flags
for each row
execute function public.set_updated_at();
