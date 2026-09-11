import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getWorkspaceUser, updateWorkspaceUserRecovery } from "./googleWorkspace.ts";
import { logOnboarding } from "./logger.ts";
import { requirePersonalRecoveryEmail } from "./recoveryEmail.ts";

export interface PortalRecoveryEmailSyncResult {
  recoveryEmail: string;
  syncStatus: "synced" | "error";
  syncedAt: string | null;
  error: string | null;
}

function profileName(user: User, record: { first_name?: string | null; last_name?: string | null } | null) {
  const meta = user.user_metadata ?? {};
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim().split(/\s+/) : [];
  return {
    firstName: record?.first_name?.trim() || (typeof meta.first_name === "string" ? meta.first_name.trim() : "") || fullName[0] || "Agent",
    lastName: record?.last_name?.trim() || (typeof meta.last_name === "string" ? meta.last_name.trim() : "") || fullName.slice(1).join(" ") || "",
  };
}

/**
 * The service client is deliberate: the browser may update only its own
 * profile through RLS, while this helper also updates the matching Workspace
 * account using server-only Directory credentials.
 */
export async function syncPortalRecoveryEmailForUser(
  adminClient: SupabaseClient,
  user: User,
  rawRecoveryEmail: unknown,
): Promise<PortalRecoveryEmailSyncResult> {
  const recoveryEmail = requirePersonalRecoveryEmail(rawRecoveryEmail);
  const workspaceEmail = user.email?.trim().toLowerCase();
  if (!workspaceEmail) throw new Error("Your PNCL email is unavailable");

  const { data: record, error: recordError } = await adminClient
    .from("onboarding_records")
    .select("id, first_name, last_name, google_user_id")
    .eq("supabase_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recordError) throw new Error(recordError.message);

  const { data: existingProfile, error: profileReadError } = await adminClient
    .from("portal_profiles")
    .select("user_id, first_name, last_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileReadError) throw new Error(profileReadError.message);

  const names = profileName(user, record);
  const pendingPayload = existingProfile
    ? {
      recovery_email: recoveryEmail,
      recovery_email_sync_status: "pending",
      recovery_email_last_synced_at: null,
      recovery_email_last_sync_error: null,
    }
    : {
      user_id: user.id,
      first_name: names.firstName,
      last_name: names.lastName,
      recovery_email: recoveryEmail,
      recovery_email_sync_status: "pending",
      recovery_email_last_synced_at: null,
      recovery_email_last_sync_error: null,
    };
  const { error: pendingError } = await adminClient
    .from("portal_profiles")
    .upsert(pendingPayload, { onConflict: "user_id" });
  if (pendingError) throw new Error(pendingError.message);

  if (record?.id) {
    const { error: onboardingError } = await adminClient
      .from("onboarding_records")
      .update({ personal_email: recoveryEmail })
      .eq("id", record.id)
      .eq("supabase_user_id", user.id);
    if (onboardingError) throw new Error(onboardingError.message);
  }

  try {
    const googleUser = await getWorkspaceUser(record?.google_user_id?.trim() || workspaceEmail);
    if (!googleUser) throw new Error("Google Workspace account was not found");
    await updateWorkspaceUserRecovery({
      userKey: googleUser.id,
      recoveryEmail,
      currentUser: googleUser,
    });
    const syncedAt = new Date().toISOString();
    const { error: syncedError } = await adminClient
      .from("portal_profiles")
      .update({
        recovery_email: recoveryEmail,
        recovery_email_sync_status: "synced",
        recovery_email_last_synced_at: syncedAt,
        recovery_email_last_sync_error: null,
      })
      .eq("user_id", user.id);
    if (syncedError) throw new Error(syncedError.message);
    return { recoveryEmail, syncStatus: "synced", syncedAt, error: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unable to update Google recovery email";
    logOnboarding("portal_recovery_email_sync_failed", { userId: user.id, workspaceEmail, detail }, "error");
    const { error: failedUpdateError } = await adminClient
      .from("portal_profiles")
      .update({
        recovery_email: recoveryEmail,
        recovery_email_sync_status: "error",
        recovery_email_last_sync_error: "Google sync needs attention. Try again or contact PNCL support.",
      })
      .eq("user_id", user.id);
    if (failedUpdateError) throw new Error(failedUpdateError.message);
    return {
      recoveryEmail,
      syncStatus: "error",
      syncedAt: null,
      error: "Google sync needs attention. Try again or contact PNCL support.",
    };
  }
}
