-- Weekly LeadSpply lead-cost charges, uploaded by admins as CSV until
-- LeadSpply offers an API. Rows are matched to portal users by email or
-- agent number at upload time; unmatched rows keep user_id null for review.
create table if not exists lead_charges (
  id uuid primary key default gen_random_uuid(),
  week_of date not null,
  user_id uuid references auth.users (id) on delete set null,
  agent_email text,
  agent_name text,
  description text,
  amount_cents integer not null default 0,
  source_file text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists lead_charges_week_of_idx on lead_charges (week_of);
create index if not exists lead_charges_user_id_idx on lead_charges (user_id);

-- Access goes through service-role edge functions only.
alter table lead_charges enable row level security;
