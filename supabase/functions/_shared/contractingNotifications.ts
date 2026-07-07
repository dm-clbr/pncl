import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { listGenesisAdminEmails } from "./genesisNotifications.ts";
import { logOnboarding } from "./logger.ts";
import {
  sendIcaSignedNotificationEmail,
  sendLicensingCompleteNotificationEmail,
} from "./resend.ts";

export function getContractingAdminUrl(): string {
  const siteUrl = Deno.env.get("PNCL_SITE_URL") ?? "http://localhost:8080";
  return `${siteUrl.replace(/\/$/, "")}/portal/admin/contracting`;
}

/**
 * Emails every admin when an agent has recorded both an NPN and an E&O policy
 * number so contracting can be initiated. Sends at most once per agent —
 * guarded by portal_profiles.licensing_notification_sent_at.
 */
export async function notifyAdminsOfLicensingComplete(
  adminClient: SupabaseClient,
  input: {
    userId: string;
    agentName: string;
    agentEmail: string;
    npn: string;
    eoPolicyNumber: string;
    hasEoCertificate: boolean;
  },
): Promise<boolean> {
  // Atomically claim the notification so concurrent saves send one email.
  const { data: claimed, error: claimError } = await adminClient
    .from("portal_profiles")
    .update({ licensing_notification_sent_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .is("licensing_notification_sent_at", null)
    .select("user_id");

  if (claimError) {
    throw new Error(claimError.message);
  }
  if (!claimed || claimed.length === 0) {
    return false;
  }

  const recipients = await listGenesisAdminEmails(adminClient);
  if (!recipients.length) {
    logOnboarding("licensing_notification_skipped", {
      userId: input.userId,
      reason: "no_admins",
    }, "warn");
    return false;
  }

  const contractingUrl = getContractingAdminUrl();
  const errors: string[] = [];

  for (const to of recipients) {
    try {
      await sendLicensingCompleteNotificationEmail({
        to,
        agentName: input.agentName,
        agentEmail: input.agentEmail,
        npn: input.npn,
        eoPolicyNumber: input.eoPolicyNumber,
        hasEoCertificate: input.hasEoCertificate,
        contractingUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send email";
      errors.push(`${to}: ${message}`);
    }
  }

  if (errors.length === recipients.length) {
    // Nothing went out — release the claim so a later save retries.
    await adminClient
      .from("portal_profiles")
      .update({ licensing_notification_sent_at: null })
      .eq("user_id", input.userId);
    throw new Error(errors.join("; "));
  }

  logOnboarding("licensing_notification_sent", {
    userId: input.userId,
    recipientCount: recipients.length - errors.length,
    failedCount: errors.length,
  });

  return true;
}

/**
 * Emails every admin when an agent signs their ICA in the portal so the comp
 * attachment can be sent. Guarded by
 * portal_ica_signatures.admin_notification_sent_at.
 */
export async function notifyAdminsOfIcaSigned(
  adminClient: SupabaseClient,
  input: {
    userId: string;
    agentName: string;
    agentEmail: string;
    signedAt: string;
  },
): Promise<boolean> {
  const { data: claimed, error: claimError } = await adminClient
    .from("portal_ica_signatures")
    .update({ admin_notification_sent_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .is("admin_notification_sent_at", null)
    .select("user_id");

  if (claimError) {
    throw new Error(claimError.message);
  }
  if (!claimed || claimed.length === 0) {
    return false;
  }

  const recipients = await listGenesisAdminEmails(adminClient);
  if (!recipients.length) {
    logOnboarding("ica_notification_skipped", {
      userId: input.userId,
      reason: "no_admins",
    }, "warn");
    return false;
  }

  const contractingUrl = getContractingAdminUrl();
  const errors: string[] = [];

  for (const to of recipients) {
    try {
      await sendIcaSignedNotificationEmail({
        to,
        agentName: input.agentName,
        agentEmail: input.agentEmail,
        signedAt: input.signedAt,
        contractingUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send email";
      errors.push(`${to}: ${message}`);
    }
  }

  if (errors.length === recipients.length) {
    await adminClient
      .from("portal_ica_signatures")
      .update({ admin_notification_sent_at: null })
      .eq("user_id", input.userId);
    throw new Error(errors.join("; "));
  }

  logOnboarding("ica_notification_sent", {
    userId: input.userId,
    recipientCount: recipients.length - errors.length,
    failedCount: errors.length,
  });

  return true;
}
