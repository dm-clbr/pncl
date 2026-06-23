import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getUserRole } from "./adminAuth.ts";
import { listPortalUsers } from "./adminAgents.ts";
import { logOnboarding } from "./logger.ts";
import { sendGenesisOnboardingNotificationEmail } from "./resend.ts";

export interface GenesisOnboardingNotificationInput {
  legalName: string;
  workspaceEmail: string;
  phoneNumber: string;
  dateOfBirth: string;
  stateOfResidence: string;
  uplineNetwork: string;
  hasLicense: string;
  npn: string | null;
  hasEoInsurance: string;
  completedAt: string;
}

export async function listGenesisAdminEmails(adminClient: SupabaseClient): Promise<string[]> {
  const users = await listPortalUsers(adminClient);
  return users
    .filter((user) => getUserRole(user) === "genesis_admin" && user.email?.trim())
    .map((user) => user.email!.trim());
}

function getGenesisAdminUrl(): string {
  const siteUrl = Deno.env.get("PNCL_SITE_URL") ?? "http://localhost:8080";
  return `${siteUrl.replace(/\/$/, "")}/portal/admin/genesis`;
}

export async function notifyGenesisAdminsOfNewOnboarding(
  adminClient: SupabaseClient,
  onboardingId: string,
  input: GenesisOnboardingNotificationInput,
): Promise<void> {
  const recipients = await listGenesisAdminEmails(adminClient);
  if (!recipients.length) {
    logOnboarding("genesis_notification_skipped", {
      onboardingId,
      reason: "no_genesis_admins",
    }, "warn");
    return;
  }

  const genesisUrl = getGenesisAdminUrl();
  const errors: string[] = [];

  for (const to of recipients) {
    try {
      await sendGenesisOnboardingNotificationEmail({
        to,
        genesisUrl,
        ...input,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send email";
      errors.push(`${to}: ${message}`);
    }
  }

  if (errors.length === recipients.length) {
    throw new Error(errors.join("; "));
  }

  const sentAt = new Date().toISOString();
  const { error: updateError } = await adminClient
    .from("onboarding_records")
    .update({ genesis_notification_sent_at: sentAt })
    .eq("id", onboardingId)
    .is("genesis_notification_sent_at", null);

  if (updateError) {
    logOnboarding("genesis_notification_mark_sent_failed", {
      onboardingId,
      error: updateError.message,
    }, "warn");
  }

  logOnboarding("genesis_notification_sent", {
    onboardingId,
    recipientCount: recipients.length - errors.length,
    failedCount: errors.length,
  });
}
