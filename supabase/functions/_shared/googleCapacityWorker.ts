import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { provisionEnrollment } from "./enrollmentProvisioning.ts";
import { getOrCreateEnrollmentHandoff } from "./enrollmentHandoff.ts";
import { capacityAdminRecipients, sendCapacityAdminNotification } from "./googleCapacityNotifications.ts";
import { getResendApiKey } from "./resend.ts";
import { CAPACITY_RETRY_MS } from "./googleCapacity.ts";
import { processGoogleSeatAlerts } from "./googleSeatAlerts.ts";
import { logOnboarding } from "./logger.ts";

export async function processCapacityQueue(db: SupabaseClient, leaseToken: string) {
  const started = Date.now();
  let completed = 0;
  let notifications = 0;
  let lastError: string | null = null;
  try {
    // Check required configuration even on an empty health-check run.
    capacityAdminRecipients();
    getResendApiKey();
    try { lastError = await processGoogleSeatAlerts(db, leaseToken); }
    catch { lastError = "Low-capacity monitor failed"; }
    // The caller holds a global lease; per-enrollment locks also protect manual retries.
    const { data: due, error } = await db.from("onboarding_records")
      .select("id").not("capacity_wait_started_at", "is", null).is("capacity_recovered_at", null).is("released_at", null)
      .in("enrollment_status", ["waiting_google_capacity", "provisioning_google", "provisioning_portal", "finalizing"])
      .lte("capacity_next_retry_at", new Date().toISOString())
      .or(`provisioning_lock_expires_at.is.null,provisioning_lock_expires_at.lt.${new Date().toISOString()}`)
      .order("capacity_next_retry_at").order("id").limit(10);
    if (error) throw new Error("Unable to read capacity retry queue");
    for (const row of due ?? []) {
      if (Date.now() - started > 75000) break;
      try {
        await provisionEnrollment(db, row.id, { requestId: leaseToken, capacityRetry: true });
        completed++;
      } catch (error) {
        lastError = error instanceof Error ? error.message.slice(0, 300) : "Capacity retry failed";
        const { error: retryError } = await db.from("onboarding_records")
          .update({ capacity_next_retry_at: new Date(Date.now() + CAPACITY_RETRY_MS).toISOString() })
          .eq("id", row.id).is("released_at", null).is("capacity_recovered_at", null);
        if (retryError) throw new Error("Unable to reschedule capacity retry");
        logOnboarding("capacity_retry_failed", { onboardingId: row.id, error: lastError }, "error");
      }
    }
    const { data: pending, error: noticeError } = await db.from("onboarding_capacity_notifications")
      .select("id,onboarding_id,event,attempts").is("sent_at", null)
      .lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(10);
    if (noticeError) throw new Error("Unable to read capacity notifications");
    for (const notice of pending ?? []) {
      if (Date.now() - started > 110000) break;
      try {
        const { data: row, error: recordError } = await db.from("onboarding_records")
          .select("id,legal_name,workspace_email,released_at,enrollment_status,capacity_recovered_at")
          .eq("id", notice.onboarding_id).maybeSingle();
        if (recordError || !row) throw new Error("Unable to load notification enrollment");
        const obsolete = (row.released_at && notice.event !== "attention")
          || (notice.event === "waiting" && row.capacity_recovered_at);
        if (!obsolete) {
          let resumeUrl: string | undefined;
          if (notice.event === "ready") {
            if (!["awaiting_google_sign_in", "ready"].includes(row.enrollment_status)) throw new Error("Enrollment is no longer ready");
            const link = await getOrCreateEnrollmentHandoff(db, row.id);
            const site = (Deno.env.get("PNCL_SITE_URL") ?? "https://www.thepncl.com").replace(/\/$/, "");
            resumeUrl = `${site}/onboarding/success/${row.id}?token=${encodeURIComponent(link.token)}`;
          }
          await sendCapacityAdminNotification({ id: notice.id, name: row.legal_name, email: row.workspace_email, event: notice.event, resumeUrl });
          notifications++;
        }
        const { error: markError } = await db.from("onboarding_capacity_notifications")
          .update({ sent_at: new Date().toISOString(), last_error: obsolete ? "superseded_or_released" : null }).eq("id", notice.id);
        if (markError) throw new Error("Unable to record notification delivery");
      } catch (error) {
        lastError = error instanceof Error ? error.message.slice(0, 300) : "Admin notification failed";
        const { error: retryError } = await db.from("onboarding_capacity_notifications").update({
          attempts: notice.attempts + 1, last_error: lastError, next_attempt_at: new Date(Date.now() + CAPACITY_RETRY_MS).toISOString(),
        }).eq("id", notice.id);
        if (retryError) throw new Error("Unable to reschedule admin notification");
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message.slice(0, 300) : "Capacity worker failed";
  } finally {
    const { error } = await db.from("onboarding_capacity_worker_state").update({
      lease_token: null, lease_until: null, last_completed_at: new Date().toISOString(), last_error: lastError,
    }).eq("id", true).eq("lease_token", leaseToken);
    if (error) logOnboarding("capacity_worker_lease_release_failed", { error: error.message }, "error");
    logOnboarding("capacity_worker_completed", { completed, notifications, error: lastError }, lastError ? "warn" : "info");
  }
  return { completed, notifications, error: lastError };
}
