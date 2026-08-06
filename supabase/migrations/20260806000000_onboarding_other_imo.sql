alter table if exists public.onboarding_records
  add column if not exists has_other_imo text;

alter table if exists public.onboarding_records
  drop constraint if exists onboarding_records_has_other_imo_check;

alter table if exists public.onboarding_records
  add constraint onboarding_records_has_other_imo_check
  check (has_other_imo is null or has_other_imo in ('Yes', 'No'));

comment on column public.onboarding_records.has_other_imo is
  'Required Yes/No response for new applications: whether the applicant is currently contracted with another IMO. Null is retained only for historical/manual records.';
