-- Admin-set carrier application statuses: PNCL marks when an agent's carrier
-- application has been submitted; the agent sees a green badge on their
-- carrier accounts table. Kept separate from portal_carrier_credentials so a
-- status can exist before the agent saves any login credentials.
create table if not exists portal_carrier_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  carrier_id uuid not null references portal_carriers (id) on delete cascade,
  application_submitted_at timestamptz,
  marked_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, carrier_id)
);

create index if not exists portal_carrier_statuses_user_id_idx
  on portal_carrier_statuses (user_id);

drop trigger if exists portal_carrier_statuses_updated_at on portal_carrier_statuses;
create trigger portal_carrier_statuses_updated_at
before update on portal_carrier_statuses
for each row
execute function public.set_updated_at();

-- Access goes through service-role edge functions only.
alter table portal_carrier_statuses enable row level security;
