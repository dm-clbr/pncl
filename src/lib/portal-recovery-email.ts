import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";
import { normalizeRecoveryEmail, validateRecoveryEmail } from "@/lib/recovery-email";

export interface PortalRecoveryEmailResult {
  recoveryEmail: string;
  syncStatus: "synced" | "error";
  syncedAt: string | null;
  error: string | null;
}

export async function syncPortalRecoveryEmail(
  accessToken: string,
  recoveryEmail: string,
): Promise<PortalRecoveryEmailResult> {
  const validationError = validateRecoveryEmail(recoveryEmail);
  if (validationError) throw new Error(validationError);
  if (!isSupabaseAuthConfigured()) throw new Error("Portal authentication is not configured.");

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/sync-portal-recovery-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recoveryEmail: normalizeRecoveryEmail(recoveryEmail) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Unable to sync your recovery email.");
  return data as PortalRecoveryEmailResult;
}
