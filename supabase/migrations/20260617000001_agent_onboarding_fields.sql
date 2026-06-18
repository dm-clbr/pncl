-- Migrate employee onboarding schema to agent onboarding schema (if prior migration ran)
alter table if exists onboarding_records drop column if exists personal_email;
alter table if exists onboarding_records drop column if exists role;
alter table if exists onboarding_records drop column if exists department;
alter table if exists onboarding_records drop column if exists start_date;

alter table if exists onboarding_records add column if not exists legal_name text;
alter table if exists onboarding_records add column if not exists date_of_birth text;
alter table if exists onboarding_records add column if not exists ssn_encrypted text;
alter table if exists onboarding_records add column if not exists state_of_residence text;
alter table if exists onboarding_records add column if not exists upline_network text;
alter table if exists onboarding_records add column if not exists has_license text;
alter table if exists onboarding_records add column if not exists npn text;
alter table if exists onboarding_records add column if not exists has_eo_insurance text;
