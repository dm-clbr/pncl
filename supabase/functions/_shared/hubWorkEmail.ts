import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AdminAuthError } from "./adminAuth.ts";
import { canAccessAdminConsole } from "./adminRoles.ts";

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
  // Admins do not enter agent onboarding. Other staff need an explicit grant.
  // requirePortalUser/getUserById read current server-controlled app metadata;
  // user metadata and stale JWT claims never establish either kind of access.
  // Bind individual grants to UUID and email so they cannot be copied or renamed.
  const exception = user.app_metadata?.hub_setup_onboarding_exception;
  const staffAccess = canAccessAdminConsole(user.app_metadata?.role)
    || (exception?.user_id === user.id && exception?.email === email);
  if (!error && !data && user.app_metadata?.enrollment_version !== 3
    && !user.app_metadata?.onboarding_id && staffAccess) {
    const records = await db.from("onboarding_records")
      .select("id", { count: "exact", head: true }).eq("supabase_user_id", user.id);
    // A mismatched, released or unfinished record still requires review.
    if (!records.error && records.count === 0) return email;
  }
  // Existing administrator-provisioned accounts predate enrollment v3. Their
  // server-managed manual record is authoritative; an unfinished v3 enrollment
  // still cannot use this legacy path.
  const legacyManual = data?.status === "manual" && user.app_metadata?.enrollment_version !== 3;
  if (error || !data || data.released_at || !(["ready", "credentials_viewed"].includes(data.status) || data.enrollment_status === "ready" || legacyManual) || data.workspace_email?.toLowerCase() !== email) {
    throw new AdminAuthError("Your PNCL work email needs support review before updating LeadSpply.", 409, "work_email_review_required");
  }
  return email;
}
