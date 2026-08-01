export type EnrollmentStatus =
  | "application_saved"
  | "saving_application"
  | "provisioning_google"
  | "google_verification_required"
  | "provisioning_portal"
  | "finalizing"
  | "ready"
  | "needs_attention";

export type EnrollmentStep = "referral" | "contract" | "application" | "google" | "portal" | "finalization";

export const RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface EnrollmentReservationRow {
  status: string;
  enrollment_status?: string | null;
  google_account_status?: string | null;
  portal_account_status?: string | null;
  google_user_id?: string | null;
  supabase_user_id?: string | null;
  workspace_email?: string | null;
  released_at: string | null;
  last_provisioning_attempt_at?: string | null;
  updated_at?: string | null;
}

export function isEnrollmentReady(row: {
  referral_status?: string | null;
  contract_status?: string | null;
  application_status?: string | null;
  google_account_status?: string | null;
  portal_account_status?: string | null;
  finalization_status?: string | null;
}): boolean {
  return (row.referral_status === "none" || row.referral_status === "finalized")
    && row.contract_status === "finalized"
    && row.application_status === "finalized"
    && row.google_account_status === "ready"
    && row.portal_account_status === "ready"
    && row.finalization_status === "ready";
}

function lastActivityMs(row: EnrollmentReservationRow): number | null {
  const value = row.last_provisioning_attempt_at ?? row.updated_at;
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * External accounts always retain identity protection. A record with no
 * external account only holds while actively provisioning; abandoned/failed
 * attempts age out so a legitimate applicant is not blocked indefinitely.
 */
export function holdsEnrollmentReservation(
  row: EnrollmentReservationRow,
  now = Date.now(),
): boolean {
  if (row.released_at) return false;
  if (row.google_user_id || row.supabase_user_id) return true;
  if (row.google_account_status === "ready" || row.google_account_status === "verification_required") return true;
  if (row.portal_account_status === "ready") return true;

  const state = row.enrollment_status;
  if (state === "ready" || row.status === "ready" || row.status === "credentials_viewed") return true;
  if (state === "needs_attention" || row.status === "failed" || row.status === "expired") return false;

  const active = state === "saving_application"
    || state === "application_saved"
    || state === "provisioning_google"
    || state === "provisioning_portal"
    || state === "finalizing"
    || row.status === "pending"
    || row.status === "creating_email";
  if (!active) return false;

  const activity = lastActivityMs(row);
  return activity === null || now - activity <= RESERVATION_TTL_MS;
}

export function publicEnrollmentStatus(state: string | null | undefined): "creating_email" | "ready" | "failed" {
  if (state === "ready") return "ready";
  if (state === "needs_attention" || state === "google_verification_required") return "failed";
  return "creating_email";
}
