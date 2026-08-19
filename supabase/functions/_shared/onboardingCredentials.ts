export interface CredentialHandoffRecord {
  enrollment_status: string;
  google_user_id: string | null;
  supabase_user_id: string | null;
  google_first_sign_in_at?: string | null;
  temporary_password_encrypted: string | null;
  workspace_email: string | null;
}

const REVEALABLE_ENROLLMENT_STATUSES = new Set([
  "awaiting_google_sign_in",
  "ready",
]);

export function canRevealTemporaryPassword(record: CredentialHandoffRecord): boolean {
  return REVEALABLE_ENROLLMENT_STATUSES.has(record.enrollment_status)
    && Boolean(record.google_user_id)
    && Boolean(record.supabase_user_id)
    && Boolean(record.workspace_email)
    && Boolean(record.temporary_password_encrypted)
    && !record.google_first_sign_in_at;
}
