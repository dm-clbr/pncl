alter table if exists onboarding_records
  add column if not exists referrer_user_id text;

create index if not exists onboarding_records_referrer_user_id_idx
  on onboarding_records(referrer_user_id);
