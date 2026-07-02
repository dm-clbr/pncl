import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getWorkspaceUser,
  isAutomaticallySuspendedGoogleUser,
  listWorkspaceUsersByEmail,
  resolveGoogleWorkspaceStatus,
  updateWorkspaceUserRecovery,
  type GoogleWorkspaceStatus,
  type WorkspaceUserDetails,
} from "./googleWorkspace.ts";
import { logOnboarding } from "./logger.ts";
import { buildGmailUrl, getEmailDomain } from "./onboarding.ts";
import { sendGmailVerificationRetryEmail } from "./resend.ts";

const PLACEHOLDER_PHONE = "000-000-0000";
const ELIGIBLE_ONBOARDING_STATUSES = ["ready", "credentials_viewed", "failed"] as const;

export interface GmailVerificationOnboardingRecord {
  id: string;
  first_name: string;
  personal_email: string | null;
  phone_number: string;
  workspace_email: string | null;
  google_user_id: string | null;
  gmail_verification_email_sent_at: string | null;
  handoff_token_hash?: string;
  handoff_token_expires_at?: string;
}

export interface ProcessSuspendedGmailResult {
  onboardingId: string;
  workspaceEmail: string;
  personalEmail: string;
  status: "sent" | "skipped" | "error";
  reason?: string;
  suspensionReason?: string | null;
}

function getSiteUrl(): string {
  return (Deno.env.get("PNCL_SITE_URL") ?? "http://localhost:8080").replace(/\/$/, "");
}

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

function buildOnboardingUrl(
  record: GmailVerificationOnboardingRecord,
  handoffToken?: string,
): string | undefined {
  if (!handoffToken) return undefined;
  if (!record.handoff_token_expires_at) return undefined;
  if (new Date(record.handoff_token_expires_at).getTime() <= Date.now()) return undefined;
  return `${getSiteUrl()}/onboarding/success/${record.id}?token=${encodeURIComponent(handoffToken)}`;
}

export async function processSuspendedGmailOnboardingRecord(
  supabase: SupabaseClient,
  record: GmailVerificationOnboardingRecord,
  options: {
    dryRun: boolean;
    forceResend: boolean;
    handoffToken?: string;
    updateRecovery: boolean;
    sendEmail: boolean;
  },
): Promise<ProcessSuspendedGmailResult> {
  const workspaceEmail = record.workspace_email?.trim().toLowerCase() ?? "";
  const personalEmail = record.personal_email?.trim().toLowerCase() ?? "";

  const baseResult = {
    onboardingId: record.id,
    workspaceEmail,
    personalEmail,
  };

  if (!workspaceEmail) {
    return { ...baseResult, status: "skipped", reason: "missing_workspace_email" };
  }

  if (!isValidPersonalEmail(personalEmail)) {
    return { ...baseResult, status: "skipped", reason: "missing_personal_email" };
  }

  if (!options.forceResend && record.gmail_verification_email_sent_at) {
    return { ...baseResult, status: "skipped", reason: "already_sent" };
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

  if (!isAutomaticallySuspendedGoogleUser(googleUser)) {
    return {
      ...baseResult,
      status: "skipped",
      reason: googleUser.suspended ? "not_automatically_suspended" : "not_suspended",
      suspensionReason: googleUser.suspensionReason,
    };
  }

  if (options.dryRun) {
    return {
      ...baseResult,
      status: "skipped",
      reason: "dry_run",
      suspensionReason: googleUser.suspensionReason,
    };
  }

  if (options.updateRecovery && isValidRecoveryPhone(record.phone_number)) {
    await updateWorkspaceUserRecovery({
      userKey: googleUser.id,
      recoveryEmail: personalEmail,
      recoveryPhone: record.phone_number,
    });
  } else if (options.updateRecovery) {
    await updateWorkspaceUserRecovery({
      userKey: googleUser.id,
      recoveryEmail: personalEmail,
    });
  }

  if (options.sendEmail) {
    await sendGmailVerificationRetryEmail({
      to: personalEmail,
      firstName: record.first_name,
      workspaceEmail,
      gmailUrl: buildGmailUrl(workspaceEmail),
      onboardingUrl: buildOnboardingUrl(record, options.handoffToken),
    });

    const sentAt = new Date().toISOString();
    const { error } = await supabase
      .from("onboarding_records")
      .update({ gmail_verification_email_sent_at: sentAt })
      .eq("id", record.id);

    if (error) {
      logOnboarding(
        "gmail_verification_email_sent_at_update_failed",
        { onboardingId: record.id, error: error.message },
        "error",
      );
    }
  }

  logOnboarding("gmail_verification_email_sent", {
    onboardingId: record.id,
    workspaceEmail,
    personalEmail,
    suspensionReason: googleUser.suspensionReason,
  });

  return {
    ...baseResult,
    status: "sent",
    suspensionReason: googleUser.suspensionReason,
  };
}

export async function notifySuspendedGmailForOnboarding(
  supabase: SupabaseClient,
  input: {
    onboardingId: string;
    handoffToken?: string;
    forceResend?: boolean;
  },
): Promise<ProcessSuspendedGmailResult> {
  const { data, error } = await supabase
    .from("onboarding_records")
    .select(
      "id, first_name, personal_email, phone_number, workspace_email, google_user_id, gmail_verification_email_sent_at, handoff_token_expires_at",
    )
    .eq("id", input.onboardingId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Onboarding record not found");
  }

  return processSuspendedGmailOnboardingRecord(
    supabase,
    data as GmailVerificationOnboardingRecord,
    {
      dryRun: false,
      forceResend: input.forceResend ?? false,
      handoffToken: input.handoffToken,
      updateRecovery: true,
      sendEmail: true,
    },
  );
}

export interface GmailVerificationCandidate {
  onboardingId: string;
  legalName: string;
  firstName: string;
  workspaceEmail: string;
  personalEmail: string;
  phoneNumber: string;
  status: string;
  gmailVerificationEmailSentAt: string | null;
  supabaseUserId: string | null;
  createdAt: string;
  googleWorkspaceStatus: GoogleWorkspaceStatus | null;
  googleSuspensionReason: string | null;
}

export async function listGmailVerificationCandidates(
  supabase: SupabaseClient,
): Promise<GmailVerificationCandidate[]> {
  const { data, error } = await supabase
    .from("onboarding_records")
    .select(`
      id,
      legal_name,
      first_name,
      workspace_email,
      personal_email,
      phone_number,
      status,
      gmail_verification_email_sent_at,
      supabase_user_id,
      created_at
    `)
    .not("workspace_email", "is", null)
    .not("personal_email", "is", null)
    .in("status", [...ELIGIBLE_ONBOARDING_STATUSES])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  let googleUsersByEmail = new Map<string, WorkspaceUserDetails>();
  try {
    googleUsersByEmail = await listWorkspaceUsersByEmail();
  } catch (googleError) {
    logOnboarding(
      "gmail_verification_candidates_google_lookup_failed",
      { error: googleError instanceof Error ? googleError.message : "Unable to load Google directory" },
      "warn",
    );
  }

  return (data ?? [])
    .map((row) => {
      const workspaceEmail = (row.workspace_email as string).trim().toLowerCase();
      const googleUser = googleUsersByEmail.get(workspaceEmail);
      const resolved = resolveGoogleWorkspaceStatus(googleUser);

      return {
        onboardingId: row.id as string,
        legalName: row.legal_name as string,
        firstName: row.first_name as string,
        workspaceEmail,
        personalEmail: (row.personal_email as string).trim().toLowerCase(),
        phoneNumber: row.phone_number as string,
        status: row.status as string,
        gmailVerificationEmailSentAt: (row.gmail_verification_email_sent_at as string | null) ?? null,
        supabaseUserId: (row.supabase_user_id as string | null) ?? null,
        createdAt: row.created_at as string,
        googleWorkspaceStatus: googleUsersByEmail.size > 0 ? resolved.status : null,
        googleSuspensionReason: resolved.suspensionReason,
      };
    })
    .filter((row) => isValidPersonalEmail(row.personalEmail));
}

export async function resolveOnboardingRecordForVerification(
  supabase: SupabaseClient,
  input: { onboardingId?: string; userId?: string },
): Promise<GmailVerificationOnboardingRecord | null> {
  if (input.onboardingId) {
    const { data, error } = await supabase
      .from("onboarding_records")
      .select(
        "id, first_name, personal_email, phone_number, workspace_email, google_user_id, gmail_verification_email_sent_at, handoff_token_expires_at",
      )
      .eq("id", input.onboardingId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as GmailVerificationOnboardingRecord | null) ?? null;
  }

  if (!input.userId) return null;

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(input.userId);
  if (userError || !userData.user?.email) return null;

  const email = userData.user.email.toLowerCase();
  const { data: byUserId } = await supabase
    .from("onboarding_records")
    .select(
      "id, first_name, personal_email, phone_number, workspace_email, google_user_id, gmail_verification_email_sent_at, handoff_token_expires_at",
    )
    .eq("supabase_user_id", input.userId)
    .maybeSingle();

  if (byUserId) return byUserId as GmailVerificationOnboardingRecord;

  const { data: byEmail } = await supabase
    .from("onboarding_records")
    .select(
      "id, first_name, personal_email, phone_number, workspace_email, google_user_id, gmail_verification_email_sent_at, handoff_token_expires_at",
    )
    .eq("workspace_email", email)
    .maybeSingle();

  return (byEmail as GmailVerificationOnboardingRecord | null) ?? null;
}

export async function backfillSuspendedGmailVerificationEmails(
  supabase: SupabaseClient,
  options: {
    dryRun: boolean;
    forceResend: boolean;
    limit?: number;
  },
): Promise<{
  dryRun: boolean;
  scanned: number;
  sent: number;
  skipped: number;
  errors: number;
  results: ProcessSuspendedGmailResult[];
}> {
  let query = supabase
    .from("onboarding_records")
    .select(
      "id, first_name, personal_email, phone_number, workspace_email, google_user_id, gmail_verification_email_sent_at, handoff_token_expires_at",
    )
    .not("workspace_email", "is", null)
    .in("status", [...ELIGIBLE_ONBOARDING_STATUSES])
    .order("created_at", { ascending: true });

  if (!options.forceResend) {
    query = query.is("gmail_verification_email_sent_at", null);
  }

  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const results: ProcessSuspendedGmailResult[] = [];
  for (const row of data ?? []) {
    try {
      const result = await processSuspendedGmailOnboardingRecord(
        supabase,
        row as GmailVerificationOnboardingRecord,
        {
          dryRun: options.dryRun,
          forceResend: options.forceResend,
          updateRecovery: !options.dryRun,
          sendEmail: !options.dryRun,
        },
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
    sent: results.filter((result) => result.status === "sent").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    errors: results.filter((result) => result.status === "error").length,
    results,
  };
}
