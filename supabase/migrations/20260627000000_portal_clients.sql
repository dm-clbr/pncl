create table if not exists portal_clients (
  id uuid primary key default gen_random_uuid(),
  agent_user_id uuid not null references auth.users (id) on delete cascade,
  primary_first_name text not null default '',
  primary_last_name text not null default '',
  primary_phone text,
  primary_email text,
  address text,
  date_met date,
  form_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_clients_agent_user_id_idx
  on portal_clients (agent_user_id);

create index if not exists portal_clients_created_at_idx
  on portal_clients (created_at desc);

create index if not exists portal_clients_primary_name_idx
  on portal_clients (primary_last_name, primary_first_name);

alter table portal_clients enable row level security;

drop policy if exists "Agents can read own clients" on portal_clients;
create policy "Agents can read own clients"
  on portal_clients
  for select
  to authenticated
  using (auth.uid() = agent_user_id);

drop policy if exists "Agents can insert own clients" on portal_clients;
create policy "Agents can insert own clients"
  on portal_clients
  for insert
  to authenticated
  with check (auth.uid() = agent_user_id);

drop policy if exists "Agents can update own clients" on portal_clients;
create policy "Agents can update own clients"
  on portal_clients
  for update
  to authenticated
  using (auth.uid() = agent_user_id)
  with check (auth.uid() = agent_user_id);

drop trigger if exists portal_clients_updated_at on portal_clients;

create trigger portal_clients_updated_at
before update on portal_clients
for each row
execute function public.set_updated_at();

grant select, insert, update on table public.portal_clients to authenticated;
