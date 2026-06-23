create table if not exists portal_carrier_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  carrier_id uuid not null references portal_carriers (id) on delete cascade,
  username text not null default '',
  password_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, carrier_id)
);

create index if not exists portal_carrier_credentials_user_id_idx
  on portal_carrier_credentials (user_id);

create index if not exists portal_carrier_credentials_carrier_id_idx
  on portal_carrier_credentials (carrier_id);

alter table portal_carrier_credentials enable row level security;

drop policy if exists "Users can read own carrier credentials" on portal_carrier_credentials;
create policy "Users can read own carrier credentials"
  on portal_carrier_credentials
  for select
  to authenticated
  using (auth.uid() = user_id);

drop trigger if exists portal_carrier_credentials_updated_at on portal_carrier_credentials;

create trigger portal_carrier_credentials_updated_at
before update on portal_carrier_credentials
for each row
execute function public.set_updated_at();
