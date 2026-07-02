import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getWorkspaceUser, updateWorkspaceUserRecovery } from "./googleWorkspace.ts";
import { logOnboarding } from "./logger.ts";
import { getEmailDomain } from "./onboarding.ts";
import {
  resolveOnboardingRecordForVerification,
  type GmailVerificationOnboardingRecord,
} from "./gmailVerificationNotifications.ts";

const PLACEHOLDER_PHONE = "000-000-0000";

function isValidPersonalEmail(email: string | null | undefined): email is string {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;
  return !normalized.endsWith(`@${getEmailDomain().toLowerCase()}`);
}

function isValidRecoveryPhone(phone: string | null | undefined): boolean {
  if (!phone?.trim()) return false;
  return phone.trim() !== PLACEHOLDER_PHONE;
}

export interface GoogleRecoveryBackfillResult {
  onboardingId: string;
  workspaceEmail: string;
  personalEmail: string;
  recoveryPhone: string | null;
  status: "updated" | "skipped" | "error";
  reason?: string;
}

export async function processGoogleRecoveryBackfillForRecord(
  record: GmailVerificationOnboardingRecord,
  options: { dryRun: boolean },
): Promise<GoogleRecoveryBackfillResult> {
  const workspaceEmail = record.workspace_email?.trim().toLowerCase() ?? "";
  const personalEmail = record.personal_email?.trim().toLowerCase() ?? "";
  const recoveryPhone = isValidRecoveryPhone(record.phone_number) ? record.phone_number.trim() : null;

  const baseResult = {
    onboardingId: record.id,
    workspaceEmail,
    personalEmail,
    recoveryPhone,
  };

  if (!workspaceEmail) {
    return { ...baseResult, status: "skipped", reason: "missing_workspace_email" };
  }

  if (!isValidPersonalEmail(personalEmail)) {
    return { ...baseResult, status: "skipped", reason: "missing_personal_email" };
  }

  let googleUser;
  try {
    googleUser = await getWorkspaceUser(record.google_user_id ?? workspaceEmail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Google user";
    return { ...baseResult, status: "error", reason: message };
  }

  if (!googleUser) {
    return { ...baseResult, status: "skipped", reason: "google_user_not_found" };
  }

  if (options.dryRun) {
    return { ...baseResult, status: "skipped", reason: "dry_run" };
  }

  try {
    if (recoveryPhone) {
      await updateWorkspaceUserRecovery({
        userKey: googleUser.id,
        recoveryEmail: personalEmail,
        recoveryPhone,
      });
    } else {
      await updateWorkspaceUserRecovery({
        userKey: googleUser.id,
        recoveryEmail: personalEmail,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Google recovery info";
    return { ...baseResult, status: "error", reason: message };
  }

  logOnboarding("google_recovery_backfill_updated", {
    onboardingId: record.id,
    workspaceEmail,
    personalEmail,
    recoveryPhone,
  });

  return { ...baseResult, status: "updated" };
}

export async function backfillGoogleWorkspaceRecovery(
  supabase: SupabaseClient,
  options: {
    dryRun: boolean;
    limit?: number;
    onboardingId?: string;
    userId?: string;
  },
): Promise<{
  dryRun: boolean;
  scanned: number;
  updated: number;
  skipped: number;
  errors: number;
  results: GoogleRecoveryBackfillResult[];
}> {
  if (options.onboardingId || options.userId) {
    const record = await resolveOnboardingRecordForVerification(supabase, {
      onboardingId: options.onboardingId,
      userId: options.userId,
    });

    if (!record) {
      return {
        dryRun: options.dryRun,
        scanned: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        results: [],
      };
    }

    const result = await processGoogleRecoveryBackfillForRecord(record, { dryRun: options.dryRun });
    return {
      dryRun: options.dryRun,
      scanned: 1,
      updated: result.status === "updated" ? 1 : 0,
      skipped: result.status === "skipped" ? 1 : 0,
      errors: result.status === "error" ? 1 : 0,
      results: [result],
    };
  }

  let query = supabase
    .from("onboarding_records")
    .select(
      "id, first_name, personal_email, phone_number, workspace_email, google_user_id, gmail_verification_email_sent_at, handoff_token_expires_at",
    )
    .not("workspace_email", "is", null)
    .order("created_at", { ascending: true });

  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const results: GoogleRecoveryBackfillResult[] = [];
  for (const row of data ?? []) {
    try {
      const result = await processGoogleRecoveryBackfillForRecord(
        row as GmailVerificationOnboardingRecord,
        { dryRun: options.dryRun },
      );
      results.push(result);
    } catch (processError) {
      const message = processError instanceof Error
        ? processError.message
        : "Unable to process onboarding record";
      results.push({
        onboardingId: row.id,
        workspaceEmail: row.workspace_email ?? "",
        personalEmail: row.personal_email ?? "",
        recoveryPhone: null,
        status: "error",
        reason: message,
      });
    }

    if (!options.dryRun) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return {
    dryRun: options.dryRun,
    scanned: results.length,
    updated: results.filter((result) => result.status === "updated").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    errors: results.filter((result) => result.status === "error").length,
    results,
  };
}
