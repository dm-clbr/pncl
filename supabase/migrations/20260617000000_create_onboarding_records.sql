create table if not exists onboarding_records (
  id uuid primary key default gen_random_uuid(),

  legal_name text not null,
  first_name text not null,
  last_name text not null,
  phone_number text not null,
  date_of_birth text not null,
  ssn_encrypted text not null,
  state_of_residence text not null,
  upline_network text not null,
  has_license text not null,
  npn text,
  has_eo_insurance text not null,

  workspace_email text,
  status text not null default 'pending',

  handoff_token_hash text not null,
  handoff_token_expires_at timestamptz not null,

  temporary_password_encrypted text,
  credentials_viewed_at timestamptz,

  google_user_id text,
  google_creation_error text,
  group_assignment_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_records_status_idx on onboarding_records(status);
create index if not exists onboarding_records_workspace_email_idx on onboarding_records(workspace_email);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists onboarding_records_updated_at on onboarding_records;

create trigger onboarding_records_updated_at
before update on onboarding_records
for each row
execute function public.set_updated_at();
