import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AdminAuthError } from "./adminAuth.ts";

/** An Auth email edit alone must not redefine the onboarding work identity. */
export async function requireHubWorkEmail(user: User, db: SupabaseClient): Promise<string> {
  const email = user.email?.trim().toLowerCase() ?? "";
  const lifecycle = user as User & { banned_until?: string; deleted_at?: string; is_anonymous?: boolean };
  if (lifecycle.deleted_at || lifecycle.is_anonymous || (lifecycle.banned_until && !(Date.parse(lifecycle.banned_until) <= Date.now()))
    || !/^[^\s@]+@thepncl\.com$/.test(email) || !user.email_confirmed_at
    || (user.app_metadata?.enrollment_version === 3 && user.app_metadata?.enrollment_ready !== true)) {
    throw new AdminAuthError("Complete PNCL onboarding and sign in with your verified work email.", 403, "work_email_unverified");
  }
  const { data, error } = await db.from("onboarding_records")
    .select("workspace_email,released_at,status,enrollment_status").eq("supabase_user_id", user.id)
    .eq("workspace_email", email).maybeSingle();
  if (error || !data || data.released_at || !(["ready", "credentials_viewed"].includes(data.status) || data.enrollment_status === "ready") || data.workspace_email?.toLowerCase() !== email) {
    throw new AdminAuthError("Your PNCL work email needs support review before updating LeadSpply.", 409, "work_email_review_required");
  }
  return email;
}
