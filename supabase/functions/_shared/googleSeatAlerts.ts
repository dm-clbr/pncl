import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { countWorkspaceUsers } from "./googleWorkspace.ts";
import { capacityAdminRecipients } from "./googleCapacityNotifications.ts";
import { sendEmail } from "./resend.ts";

export function buildLowCapacityEmail(input: { threshold: number; remaining: number; used_count: number; account_limit: number; observed_at: string }) {
  const urgent = input.threshold === 5;
  const available = Math.max(0, input.remaining);
  return {
    subject: `${urgent ? "Urgent" : "Warning"}: ${available} Google account spaces remaining — PNCL`,
    html: `<div style="font-family:sans-serif;max-width:600px"><h2>${urgent ? "Google capacity is critically low" : "Google capacity is running low"}</h2><p><strong>${available} account spaces remain</strong> against PNCL’s configured ${input.account_limit}-account cap (${input.used_count} accounts in Google Directory).</p><p>Checked ${new Date(input.observed_at).toISOString()}. This is the ${input.threshold}-remaining alert.</p><p>Arrange a limit increase or review inactive accounts before new reps are blocked. Suspended and unlicensed accounts are included; removing a Gmail license alone does not delete an account.</p><p>This monitors the configured Google account cap, separately from Gmail license availability. If Google increases the cap, update PNCL’s monitored limit. Applications remain saved and retry automatically if capacity runs out.</p><p><a href="https://admin.google.com/ac/users">Review Google users</a> · <a href="https://admin.google.com/ac/billing/subscriptions">Review subscriptions</a></p></div>`,
  };
}

/** Runs under the existing capacity worker lease. Failures do not stop enrollment recovery. */
export async function processGoogleSeatAlerts(db: SupabaseClient, leaseToken: string): Promise<string | null> {
  let failure: string | null = null;
  const { data: config, error } = await db.from("google_capacity_monitor").select("*").eq("id", true).maybeSingle();
  if (error) return "Unable to read Google capacity monitor configuration";
  if (!config?.enabled) return null;
  if (Date.parse(config.next_check_at) <= Date.now()) {
    try {
      const observedAt = new Date().toISOString();
      const used = await countWorkspaceUsers();
      const { error: saveError } = await db.rpc("google_capacity_record_count", {
        p_used: used, p_limit: config.account_limit, p_observed_at: observedAt, p_lease_token: leaseToken,
      });
      if (saveError) throw new Error("Unable to save Google capacity count");
    } catch (error) {
      failure = error instanceof Error ? error.message.slice(0, 300) : "Unable to check Google capacity";
      const { error: recordError } = await db.from("google_capacity_monitor").update({
        last_error: failure, next_check_at: new Date(Date.now() + 300000).toISOString(),
      }).eq("id", true);
      if (recordError) failure = "Unable to record Google capacity check failure";
    }
  }
  const { data: notices, error: noticeError } = await db.from("google_capacity_alerts").select("*")
    .is("sent_at", null).is("cancelled_at", null).lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(2);
  if (noticeError) return "Unable to read low-capacity alert queue";
  for (const notice of notices ?? []) {
    try {
      const { data: current, error: currentError } = await db.from("google_capacity_monitor")
        .select("enabled,cycle_id,account_limit").eq("id", true).maybeSingle();
      if (currentError || !current) throw new Error("Unable to recheck low-capacity alert");
      if (!current.enabled || current.cycle_id !== notice.cycle_id || current.account_limit !== notice.account_limit) continue;
      await sendEmail({ ...buildLowCapacityEmail(notice), to: capacityAdminRecipients(), idempotencyKey: `google-capacity-alert/${notice.id}` });
      const { error: sentError } = await db.from("google_capacity_alerts").update({ sent_at: new Date().toISOString(), last_error: null }).eq("id", notice.id);
      if (sentError) throw new Error("Unable to record low-capacity alert delivery");
    } catch (error) {
      failure = error instanceof Error ? error.message.slice(0, 300) : "Unable to send low-capacity alert";
      const { error: retryError } = await db.from("google_capacity_alerts").update({
        attempts: notice.attempts + 1, last_error: failure, next_attempt_at: new Date(Date.now() + 300000).toISOString(),
      }).eq("id", notice.id);
      if (retryError) failure = "Unable to reschedule low-capacity alert";
    }
  }
  return failure;
}
