import { sendEmail } from "./resend.ts";

export function capacityAdminRecipients(): string[] {
  const value = Deno.env.get("PNCL_GOOGLE_CAPACITY_NOTIFY_EMAILS")
    || Deno.env.get("PNCL_GOOGLE_FIRST_SIGNIN_NOTIFY_EMAILS")
    || Deno.env.get("GOOGLE_WORKSPACE_ADMIN_EMAIL") || "";
  const recipients = [...new Set(value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length || recipients.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Google capacity admin notification recipients are not configured");
  return recipients;
}
function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
export function buildCapacityEmail(input: { name: string; email: string; event: string; adminUrl: string; resumeUrl?: string }) {
  const heading = input.event === "waiting" ? "Enrollment waiting for Google Workspace capacity"
    : input.event === "ready" ? "Google capacity recovered — enrollment ready" : "Enrollment retry needs admin attention";
  const message = input.event === "waiting"
    ? "The application and signed agreement are saved. Check the Workspace user cap, available Gmail licenses, license assignment in Sales Reps, and Gmail activation. PNCL will retry automatically every 5 minutes. Do not create another enrollment."
    : input.event === "ready"
    ? "Automatic retry completed Google and Hub setup. Send the private resume link below only to this agent so they can finish Gmail sign-in. No new application or signature is needed."
    : "Google capacity recovery encountered a different setup error. Automatic provisioning has stopped for this enrollment. Review the saved enrollment in Admin; do not start a duplicate application.";
  return {
    subject: `${heading}: ${input.name}`,
    html: `<div style="font-family:sans-serif;max-width:600px"><h2>${escape(heading)}</h2><p>${escape(input.name)} — ${escape(input.email)}</p><p>${message}</p>${input.resumeUrl ? `<p><a href="${escape(input.resumeUrl)}">Private resume link for ${escape(input.name)}</a> (Admin can copy a fresh link if it expires)</p>` : ""}<p><a href="${escape(input.adminUrl)}">Open Agent enrollments</a></p></div>`,
  };
}
export async function sendCapacityAdminNotification(input: { id: string; name: string; email: string; event: string; resumeUrl?: string }) {
  const site = (Deno.env.get("PNCL_SITE_URL") ?? "https://www.thepncl.com").replace(/\/$/, "");
  const message = buildCapacityEmail({ ...input, adminUrl: `${site}/portal/admin/onboarding-holds` });
  await sendEmail({ ...message, to: capacityAdminRecipients(), idempotencyKey: `capacity-notice/${input.id}` });
}
