import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

export const GENESIS_LOGIN_URL = "https://www.pinnaclegenesis.cc/";

function getGenesisAccountCreatedAt(user: User | null): string | null {
  const value = user?.user_metadata?.genesis_account_created_at;
  return typeof value === "string" && value.trim() ? value : null;
}

function isGenesisNoticeDismissed(user: User | null): boolean {
  return user?.user_metadata?.genesis_account_notice_dismissed === true;
}

export function shouldShowGenesisNotice(user: User | null): boolean {
  return Boolean(getGenesisAccountCreatedAt(user)) && !isGenesisNoticeDismissed(user);
}

/**
 * Set by scripts/reset-portal-ica.mjs after an ICA template reset; cleared by
 * submit-portal-ica when the user signs the new agreement.
 */
export function shouldShowIcaResignNotice(user: User | null): boolean {
  return user?.user_metadata?.ica_resign_required === true;
}

/**
 * Set by admin-reset-portal-w9 after an admin archives a user's W-9; cleared by
 * submit-portal-w9 when the user submits a new form.
 */
export function shouldShowW9ResignNotice(user: User | null): boolean {
  return user?.user_metadata?.w9_resign_required === true;
}

export async function refreshPortalUser(): Promise<User | null> {
  const supabase = getSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function dismissGenesisNotice(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("You must be signed in to dismiss this notice.");
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      genesis_account_notice_dismissed: true,
    },
  });

  if (error) throw error;
}
