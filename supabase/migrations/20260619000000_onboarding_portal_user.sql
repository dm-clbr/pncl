alter table if exists onboarding_records
  add column if not exists supabase_user_id text;

create index if not exists onboarding_records_supabase_user_id_idx
  on onboarding_records(supabase_user_id);
