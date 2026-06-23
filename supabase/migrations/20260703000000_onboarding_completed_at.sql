alter table if exists onboarding_records
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists genesis_notification_sent_at timestamptz;

create index if not exists onboarding_records_onboarding_completed_at_idx
  on onboarding_records (onboarding_completed_at desc nulls last);

update onboarding_records
set onboarding_completed_at = coalesce(credentials_viewed_at, updated_at)
where onboarding_completed_at is null
  and status in ('ready', 'credentials_viewed', 'email_created');
