-- Setter/closer commission splits tracked per insurance policy (replaces Google Sheet).
create table if not exists setter_closer_policies (
  id uuid primary key default gen_random_uuid(),
  policy_number text not null,
  carrier text,
  client_name text,
  -- Who purchased the lead determines the split: setter = 50/50, closer = 70/30.
  lead_purchaser text not null,
  split_type text not null,
  setter_user_id uuid references auth.users (id) on delete set null,
  setter_npn text,
  setter_name text,
  closer_user_id uuid references auth.users (id) on delete set null,
  closer_npn text not null,
  closer_name text,
  policy_date date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table setter_closer_policies drop constraint if exists setter_closer_policies_lead_purchaser_check;
alter table setter_closer_policies add constraint setter_closer_policies_lead_purchaser_check
  check (lead_purchaser in ('setter', 'closer'));

alter table setter_closer_policies drop constraint if exists setter_closer_policies_split_type_check;
alter table setter_closer_policies add constraint setter_closer_policies_split_type_check
  check (split_type in ('50_50', '70_30'));

create index if not exists setter_closer_policies_closer_npn_idx
  on setter_closer_policies (closer_npn);

create index if not exists setter_closer_policies_setter_npn_idx
  on setter_closer_policies (setter_npn);

create index if not exists setter_closer_policies_policy_date_idx
  on setter_closer_policies (policy_date desc nulls last);

drop trigger if exists setter_closer_policies_updated_at on setter_closer_policies;
create trigger setter_closer_policies_updated_at
before update on setter_closer_policies
for each row execute function set_updated_at();

-- Access through service-role edge functions only.
alter table setter_closer_policies enable row level security;
