import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getFromAddress, getResendApiKey } from "./resend.ts";
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

export async function sendDocumentNotifications(client: SupabaseClient, scope: { campaignId?: string; userId?: string; retry?: boolean }) {
  const key = getResendApiKey(); // Fail before claiming any emails when unconfigured.
  const siteUrl = Deno.env.get("PNCL_SITE_URL");
  if (!siteUrl) throw new Error("PNCL_SITE_URL is not configured. Set the portal URL before sending emails.");
  const portalUrl = new URL(siteUrl);
  if (portalUrl.protocol !== "https:" && !(portalUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(portalUrl.hostname))) throw new Error("Configure a secure PNCL_SITE_URL.");
  const { data: rows, error } = await client.rpc("claim_document_notifications", { p_campaign: scope.campaignId ?? null, p_user: scope.userId ?? null, p_retry: scope.retry ?? true });
  if (error) throw error;
  let sent = 0; let failed = 0;
  for (const row of rows ?? []) {
    // Stay within the provider's default request rate during bulk rollouts.
    if (sent + failed > 0) await new Promise(resolve => setTimeout(resolve, 600));
    try {
      const { data: campaign, error: campaignError } = await client.from("portal_document_campaigns").select("title").eq("id", row.campaign_id).single();
      if (campaignError) throw campaignError;
      const { data: recipient, error: recipientError } = await client.auth.admin.getUserById(row.user_id);
      if (recipientError || !recipient.user?.email) throw new Error("Agent email is unavailable.");
      const link = new URL(`/portal/documents?request=${row.id}`, portalUrl).href;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `document-request-${row.id}` },
        body: JSON.stringify({ from: getFromAddress(), to: [recipient.user.email], subject: `Signature requested: ${campaign.title}`,
          html: `<p>PNCL has requested your signature on <strong>${escapeHtml(campaign.title)}</strong>.</p><p><a href="${escapeHtml(link)}">Review and sign in your PNCL portal</a></p><p>Use your full legal first and last name when signing.</p>` }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Email provider returned ${response.status}. Retry the notification.`);
      const { error: saveError } = await client.from("portal_document_requests").update({ notification_status: "sent", notification_sent_at: new Date().toISOString(), notification_error: null }).eq("id", row.id);
      if (saveError) throw saveError;
      sent++;
    } catch (err) {
      failed++;
      const { error: saveError } = await client.from("portal_document_requests").update({ notification_status: "failed", notification_error: err instanceof Error ? err.message : "Notification failed" }).eq("id", row.id);
      if (saveError) throw saveError;
    }
  }
  return { sent, failed };
}
