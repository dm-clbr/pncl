alter table if exists onboarding_records
  add column if not exists personal_email text;
