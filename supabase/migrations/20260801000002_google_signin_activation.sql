-- Account provisioning and actual first Google sign-in are distinct.  Keep
-- the latter explicit so a recruit is never shown as fully portal-ready
-- before Google has accepted their temporary password.
alter table onboarding_records
  add column if not exists google_first_sign_in_at timestamptz,
  add column if not exists google_sign_in_checked_at timestamptz;

alter table onboarding_records
  drop constraint if exists onboarding_records_enrollment_status_check,
  add constraint onboarding_records_enrollment_status_check check (enrollment_status in (
    'saving_application', 'application_saved', 'provisioning_google', 'google_verification_required',
    'provisioning_portal', 'finalizing', 'awaiting_google_sign_in', 'ready', 'needs_attention'
  ));

create index if not exists onboarding_records_google_activation_idx
  on onboarding_records (enrollment_status, google_first_sign_in_at)
  where enrollment_status = 'awaiting_google_sign_in';
