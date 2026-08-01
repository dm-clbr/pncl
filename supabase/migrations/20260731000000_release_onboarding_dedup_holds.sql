-- Deleting a portal account left its onboarding record at status 'failed',
-- which every admin view hides but the submit-time dedup still counts as a
-- live account. That permanently burned the applicant's phone number and SSN
-- with no way for support to see or clear the hold. released_at makes the
-- release explicit so it no longer has to be inferred from status.

alter table onboarding_records
  add column if not exists released_at timestamptz;

comment on column onboarding_records.released_at is
  'When set, this record no longer reserves its phone number or SSN, so the applicant can submit a new application.';

create index if not exists onboarding_records_phone_number_idx
  on onboarding_records (phone_number);

drop index if exists onboarding_records_ssn_hash_active_idx;

create unique index onboarding_records_ssn_hash_active_idx
  on onboarding_records (ssn_hash)
  where status not in ('failed', 'expired')
    and ssn_hash is not null
    and released_at is null;

-- Release the holds already stranded by past deletions, and by early Google
-- provisioning failures that never created an account. Records that failed
-- with a live Google user keep their hold: those are auto-suspended accounts
-- awaiting Gmail verification, and the agent should finish verifying rather
-- than start a second application.
update onboarding_records
set released_at = now()
where released_at is null
  and status = 'failed'
  and (google_creation_error is null or google_user_id is null);
