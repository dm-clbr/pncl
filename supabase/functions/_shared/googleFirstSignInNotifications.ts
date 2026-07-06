import { logOnboarding } from "./logger.ts";
import { sendGoogleFirstSignInAdminEmail } from "./resend.ts";

export interface GoogleFirstSignInNotificationInput {
  legalName: string;
  workspaceEmail: string;
  autoSuspended?: boolean;
}

function listGoogleFirstSignInNotifyEmails(): string[] {
  const explicit = Deno.env.get("PNCL_GOOGLE_FIRST_SIGNIN_NOTIFY_EMAILS")?.trim();
  if (explicit) {
    return [...new Set(
      explicit.split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    )];
  }

  const adminEmail = Deno.env.get("GOOGLE_WORKSPACE_ADMIN_EMAIL")?.trim().toLowerCase();
  return adminEmail ? [adminEmail] : [];
}

export async function notifyGoogleWorkspaceAdminOfFirstSignIn(
  input: GoogleFirstSignInNotificationInput,
): Promise<void> {
  const recipients = listGoogleFirstSignInNotifyEmails();
  if (!recipients.length) {
    logOnboarding("google_first_signin_notification_skipped", {
      workspaceEmail: input.workspaceEmail,
      reason: "no_recipients",
    }, "warn");
    return;
  }

  const errors: string[] = [];

  for (const to of recipients) {
    try {
      await sendGoogleFirstSignInAdminEmail({
        to,
        legalName: input.legalName,
        workspaceEmail: input.workspaceEmail,
        autoSuspended: input.autoSuspended,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send email";
      errors.push(`${to}: ${message}`);
    }
  }

  if (errors.length === recipients.length) {
    throw new Error(errors.join("; "));
  }

  logOnboarding("google_first_signin_notification_sent", {
    workspaceEmail: input.workspaceEmail,
    autoSuspended: input.autoSuspended ?? false,
    recipientCount: recipients.length - errors.length,
    failedCount: errors.length,
  });
}
