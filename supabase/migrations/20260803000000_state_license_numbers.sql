-- State-only selections do not prove an active license.  Keep the old array
-- for backwards-compatible exports, while the number-bearing map is the
-- canonical source for licensing completion going forward.
alter table public.portal_profiles
  add column if not exists state_license_numbers jsonb not null default '{}'::jsonb;

alter table public.portal_profiles
  drop constraint if exists portal_profiles_state_license_numbers_object;

alter table public.portal_profiles
  add constraint portal_profiles_state_license_numbers_object
  check (jsonb_typeof(state_license_numbers) = 'object');

comment on column public.portal_profiles.state_license_numbers is
  'Map of two-letter state code to active insurance license number. A state alone is not evidence of a license.';
