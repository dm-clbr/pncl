alter table if exists onboarding_records
  add column if not exists gmail_verification_email_sent_at timestamptz;

create index if not exists onboarding_records_gmail_verification_email_sent_at_idx
  on onboarding_records (gmail_verification_email_sent_at);
