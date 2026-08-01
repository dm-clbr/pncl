import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { holdsDedupReservation } from "./portalReferralInvites.ts";
import { listPortalUsers } from "./adminAgents.ts";
import { isEnrollmentReady } from "./enrollmentState.ts";

/**
 * An onboarding record reserves its applicant's phone number and SSN so a
 * second application cannot burn the same mobile number for Google account
 * verification. When the underlying account is retired the reservation has to
 * be released too, otherwise the applicant is locked out with no way for
 * support to see why. These helpers back the admin screen that inspects and
 * clears those reservations.
 */
export interface OnboardingHold {
  onboardingId: string;
  legalName: string;
  phoneNumber: string;
  workspaceEmail: string | null;
  personalEmail: string | null;
  uplineNetwork: string | null;
  status: string;
  supabaseUserId: string | null;
  googleUserId: string | null;
  referralInviteId: string | null;
  contractSignatureId: string | null;
  hasPortalAccount: boolean;
  hasGoogleAccount: boolean;
  blocksNewApplication: boolean;
  holdsSsn: boolean;
  googleCreationError: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  enrollmentStatus: string;
  referralStatus: string;
  contractStatus: string;
  applicationStatus: string;
  googleAccountStatus: string;
  portalAccountStatus: string;
  finalizationStatus: string;
  failedStep: string | null;
  failureCode: string | null;
  failureDetail: string | null;
  needsAttention: boolean;
  provisioningAttempts: number;
  lastProvisioningAttemptAt: string | null;
  referralValidatedAt: string | null;
  contractSignedAt: string | null;
  applicationSavedAt: string | null;
  googleProvisionedAt: string | null;
  portalLinkedAt: string | null;
  finalizedAt: string | null;
}

interface OnboardingHoldRow {
  id: string;
  legal_name: string;
  phone_number: string;
  workspace_email: string | null;
  personal_email: string | null;
  upline_network: string | null;
  status: string;
  supabase_user_id: string | null;
  google_user_id: string | null;
  referral_invite_id: string | null;
  contract_signature_id: string | null;
  ssn_hash: string | null;
  google_creation_error: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
  enrollment_status: string;
  referral_status: string;
  contract_status: string;
  application_status: string;
  google_account_status: string;
  portal_account_status: string;
  finalization_status: string;
  failed_step: string | null;
  failure_code: string | null;
  failure_detail: string | null;
  provisioning_attempts: number;
  last_provisioning_attempt_at: string | null;
  referral_validated_at: string | null;
  contract_signed_at: string | null;
  application_saved_at: string | null;
  google_provisioned_at: string | null;
  portal_linked_at: string | null;
  finalized_at: string | null;
}

const HOLD_COLUMNS = `
  id,
  legal_name,
  phone_number,
  workspace_email,
  personal_email,
  upline_network,
  status,
  supabase_user_id,
  google_user_id,
  referral_invite_id,
  contract_signature_id,
  ssn_hash,
  google_creation_error,
  released_at,
  created_at,
  updated_at,
  enrollment_status,
  referral_status,
  contract_status,
  application_status,
  google_account_status,
  portal_account_status,
  finalization_status,
  failed_step,
  failure_code,
  failure_detail,
  provisioning_attempts,
  last_provisioning_attempt_at,
  referral_validated_at,
  contract_signed_at,
  application_saved_at,
  google_provisioned_at,
  portal_linked_at,
  finalized_at
`;

/** Onboarding stores phones as 111-222-3333, so accept any 10-digit spelling. */
export function normalizePhoneSearch(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function matchesSearch(row: OnboardingHoldRow, term: string): boolean {
  const needle = term.toLowerCase();
  const phoneMatch = normalizePhoneSearch(term);
  if (phoneMatch && row.phone_number === phoneMatch) return true;

  return [row.legal_name, row.phone_number, row.workspace_email, row.personal_email]
    .some((field) => field?.toLowerCase().includes(needle));
}

function toHold(
  row: OnboardingHoldRow,
  livePortalUserIds: Set<string>,
): OnboardingHold {
  const enrollmentReady = isEnrollmentReady(row);
  return {
    onboardingId: row.id,
    legalName: row.legal_name,
    phoneNumber: row.phone_number,
    workspaceEmail: row.workspace_email,
    personalEmail: row.personal_email,
    uplineNetwork: row.upline_network,
    status: row.status,
    supabaseUserId: row.supabase_user_id,
    googleUserId: row.google_user_id,
    referralInviteId: row.referral_invite_id,
    contractSignatureId: row.contract_signature_id,
    hasPortalAccount: Boolean(row.supabase_user_id && livePortalUserIds.has(row.supabase_user_id)),
    hasGoogleAccount: Boolean(
      row.google_user_id
      || row.google_account_status === "ready"
      || row.google_account_status === "verification_required"
      || row.enrollment_status === "ready"
      || ["ready", "email_created", "credentials_viewed"].includes(row.status),
    ),
    blocksNewApplication: holdsDedupReservation({
      status: row.status,
      enrollment_status: row.enrollment_status,
      google_account_status: row.google_account_status,
      portal_account_status: row.portal_account_status,
      google_user_id: row.google_user_id,
      supabase_user_id: row.supabase_user_id,
      workspace_email: row.workspace_email,
      released_at: row.released_at,
      last_provisioning_attempt_at: row.last_provisioning_attempt_at,
      updated_at: row.updated_at,
    }),
    holdsSsn: Boolean(row.ssn_hash),
    googleCreationError: row.google_creation_error,
    releasedAt: row.released_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    enrollmentStatus: row.enrollment_status,
    referralStatus: row.referral_status,
    contractStatus: row.contract_status,
    applicationStatus: row.application_status,
    googleAccountStatus: row.google_account_status,
    portalAccountStatus: row.portal_account_status,
    finalizationStatus: row.finalization_status,
    failedStep: row.failed_step,
    failureCode: row.failure_code,
    failureDetail: row.failure_detail,
    needsAttention: row.enrollment_status === "needs_attention"
      || row.enrollment_status === "google_verification_required"
      || (row.enrollment_status === "ready" && !enrollmentReady),
    provisioningAttempts: row.provisioning_attempts,
    lastProvisioningAttemptAt: row.last_provisioning_attempt_at,
    referralValidatedAt: row.referral_validated_at,
    contractSignedAt: row.contract_signed_at,
    applicationSavedAt: row.application_saved_at,
    googleProvisionedAt: row.google_provisioned_at,
    portalLinkedAt: row.portal_linked_at,
    finalizedAt: row.finalized_at,
  };
}

/**
 * Without a search term this returns the cleanup queue: records that no longer
 * belong to a live portal account. A search term widens the result to every
 * matching record so support can answer "why is this phone number blocked?"
 * even when the holder is a healthy agent.
 */
export async function listOnboardingHolds(
  adminClient: SupabaseClient,
  search?: string,
): Promise<OnboardingHold[]> {
  const [{ data, error }, portalUsers] = await Promise.all([
    adminClient
      .from("onboarding_records")
      .select(HOLD_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(250),
    listPortalUsers(adminClient),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  const livePortalUserIds = new Set(portalUsers.map((user) => user.id));
  const term = search?.trim() ?? "";
  const rows = (data ?? []) as OnboardingHoldRow[];

  const holds = rows
    .filter((row) => (term ? matchesSearch(row, term) : true))
    .map((row) => toHold(row, livePortalUserIds));

  return holds;
}

export class OnboardingHoldError extends Error {
  constructor(message: string, readonly code: string, readonly status = 409) {
    super(message);
    this.name = "OnboardingHoldError";
  }
}

export async function setOnboardingHoldReleased(
  adminClient: SupabaseClient,
  onboardingId: string,
  released: boolean,
): Promise<OnboardingHold> {
  const { data: existing, error: loadError } = await adminClient
    .from("onboarding_records")
    .select(HOLD_COLUMNS)
    .eq("id", onboardingId)
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }
  if (!existing) {
    throw new OnboardingHoldError("Onboarding record not found.", "not_found", 404);
  }

  const portalUsers = await listPortalUsers(adminClient);
  const livePortalUserIds = new Set(portalUsers.map((user) => user.id));
  const current = toHold(existing as OnboardingHoldRow, livePortalUserIds);

  // Releasing a record that still backs a working portal account would let a
  // second application claim the same phone number and SSN as a live agent.
  if (released && (current.hasPortalAccount || current.hasGoogleAccount)) {
    throw new OnboardingHoldError(
      "This enrollment still has a Google or portal account. Retire the external account before releasing its identity reservation.",
      "has_external_account",
    );
  }

  const { data: updated, error: updateError } = await adminClient
    .from("onboarding_records")
    .update({ released_at: released ? new Date().toISOString() : null })
    .eq("id", onboardingId)
    .select(HOLD_COLUMNS)
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? "Unable to update onboarding hold");
  }

  return toHold(updated as OnboardingHoldRow, livePortalUserIds);
}
