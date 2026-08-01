-- Durable, inspectable state for the referral -> contract -> application ->
-- Google -> portal enrollment workflow. The existing status column remains for
-- compatibility, but enrollment_status and the step columns are authoritative.

alter table onboarding_records
  add column if not exists contract_signature_id uuid references onboarding_contract_signatures(id),
  add column if not exists enrollment_status text not null default 'application_saved',
  add column if not exists referral_status text not null default 'none',
  add column if not exists contract_status text not null default 'signed',
  add column if not exists application_status text not null default 'saved',
  add column if not exists google_account_status text not null default 'pending',
  add column if not exists portal_account_status text not null default 'pending',
  add column if not exists finalization_status text not null default 'pending',
  add column if not exists failed_step text,
  add column if not exists failure_code text,
  add column if not exists failure_detail text,
  add column if not exists provisioning_attempts integer not null default 0,
  add column if not exists last_provisioning_attempt_at timestamptz,
  add column if not exists provisioning_lock_token uuid,
  add column if not exists provisioning_lock_expires_at timestamptz,
  add column if not exists referral_validated_at timestamptz,
  add column if not exists contract_signed_at timestamptz,
  add column if not exists application_saved_at timestamptz,
  add column if not exists google_provisioned_at timestamptz,
  add column if not exists portal_linked_at timestamptz,
  add column if not exists finalized_at timestamptz;

alter table onboarding_records
  drop constraint if exists onboarding_records_enrollment_status_check,
  add constraint onboarding_records_enrollment_status_check check (enrollment_status in (
    'saving_application', 'application_saved', 'provisioning_google', 'google_verification_required',
    'provisioning_portal', 'finalizing', 'ready', 'needs_attention'
  )),
  drop constraint if exists onboarding_records_referral_status_check,
  add constraint onboarding_records_referral_status_check check (referral_status in (
    'none', 'validated', 'claimed', 'finalized', 'failed'
  )),
  drop constraint if exists onboarding_records_contract_status_check,
  add constraint onboarding_records_contract_status_check check (contract_status in (
    'signed', 'finalized', 'failed'
  )),
  drop constraint if exists onboarding_records_application_status_check,
  add constraint onboarding_records_application_status_check check (application_status in (
    'saving', 'saved', 'finalized', 'failed'
  )),
  drop constraint if exists onboarding_records_google_account_status_check,
  add constraint onboarding_records_google_account_status_check check (google_account_status in (
    'pending', 'provisioning', 'ready', 'verification_required', 'failed'
  )),
  drop constraint if exists onboarding_records_portal_account_status_check,
  add constraint onboarding_records_portal_account_status_check check (portal_account_status in (
    'pending', 'provisioning', 'ready', 'failed'
  )),
  drop constraint if exists onboarding_records_finalization_status_check,
  add constraint onboarding_records_finalization_status_check check (finalization_status in (
    'pending', 'finalizing', 'ready', 'failed'
  ));

create unique index if not exists onboarding_records_contract_signature_id_idx
  on onboarding_records(contract_signature_id)
  where contract_signature_id is not null;

create index if not exists onboarding_records_attention_idx
  on onboarding_records(enrollment_status, last_provisioning_attempt_at desc);

-- Recover the contract identifier for existing records before backfilling step state.
update onboarding_records r
set contract_signature_id = c.id,
    contract_signed_at = c.signed_at
from onboarding_contract_signatures c
where c.onboarding_id = r.id
  and r.contract_signature_id is null;

update onboarding_records
set application_saved_at = coalesce(application_saved_at, created_at),
    contract_signed_at = coalesce(contract_signed_at, created_at),
    referral_status = case when referral_invite_id is null then 'none' else 'finalized' end,
    referral_validated_at = case
      when referral_invite_id is not null then coalesce(referral_validated_at, created_at)
      else referral_validated_at
    end,
    contract_status = case
      when onboarding_completed_at is not null then 'finalized' else 'signed'
    end,
    application_status = case
      when onboarding_completed_at is not null then 'finalized' else 'saved'
    end,
    google_account_status = case
      when google_user_id is not null and google_creation_error ilike '%automatically suspended%' then 'verification_required'
      when google_user_id is not null then 'ready'
      when status = 'failed' then 'failed'
      else 'pending'
    end,
    portal_account_status = case
      when supabase_user_id is not null then 'ready'
      when status in ('ready', 'email_created', 'credentials_viewed') then 'failed'
      else 'pending'
    end,
    finalization_status = case
      when google_user_id is not null and google_creation_error ilike '%automatically suspended%' then 'pending'
      when google_user_id is not null and supabase_user_id is not null then 'ready'
      when status in ('ready', 'email_created', 'credentials_viewed') then 'failed'
      else 'pending'
    end,
    enrollment_status = case
      when google_user_id is not null and google_creation_error ilike '%automatically suspended%' then 'google_verification_required'
      when google_user_id is not null and supabase_user_id is not null then 'ready'
      when status = 'failed' or status in ('ready', 'email_created', 'credentials_viewed') then 'needs_attention'
      else 'application_saved'
    end,
    failed_step = case
      when status in ('ready', 'email_created', 'credentials_viewed') and supabase_user_id is null then 'portal'
      when status = 'failed' then 'google'
      else failed_step
    end,
    failure_code = case
      when status in ('ready', 'email_created', 'credentials_viewed') and supabase_user_id is null then 'legacy_portal_link_missing'
      when status = 'failed' and google_user_id is not null then 'google_verification_required'
      when status = 'failed' then 'legacy_google_failure'
      else failure_code
    end,
    google_provisioned_at = case when google_user_id is not null then coalesce(google_provisioned_at, updated_at) else google_provisioned_at end,
    portal_linked_at = case when supabase_user_id is not null then coalesce(portal_linked_at, updated_at) else portal_linked_at end,
    finalized_at = case
      when google_user_id is not null and supabase_user_id is not null
        and coalesce(google_creation_error, '') not ilike '%automatically suspended%'
      then coalesce(finalized_at, onboarding_completed_at, updated_at)
      else finalized_at
    end;

comment on column onboarding_records.failure_detail is
  'Admin-only diagnostic detail. Never return this field from public onboarding endpoints.';
