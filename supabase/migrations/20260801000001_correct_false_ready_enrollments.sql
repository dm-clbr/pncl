-- The initial legacy backfill prioritized the presence of both external IDs
-- over an outstanding Google auto-suspension. Such a row is not ready: Google
-- verification must complete before finalization can be retried.
update onboarding_records
set enrollment_status = 'google_verification_required',
    finalization_status = 'pending',
    failed_step = 'google',
    failure_code = 'google_verification_required',
    finalized_at = null
where enrollment_status = 'ready'
  and google_account_status = 'verification_required';

-- Defensive invariant repair for any other legacy ready row whose explicit
-- prerequisites are incomplete. No applicant data or external account state
-- is modified; the row is surfaced to the admin attention queue.
update onboarding_records
set enrollment_status = 'needs_attention',
    finalization_status = 'failed',
    failed_step = coalesce(failed_step, 'finalization'),
    failure_code = coalesce(failure_code, 'legacy_prerequisite_incomplete'),
    finalized_at = null
where enrollment_status = 'ready'
  and (
    google_user_id is null
    or supabase_user_id is null
    or google_account_status <> 'ready'
    or portal_account_status <> 'ready'
    or finalization_status <> 'ready'
    or contract_status <> 'finalized'
    or application_status <> 'finalized'
    or referral_status not in ('none', 'finalized')
  );
