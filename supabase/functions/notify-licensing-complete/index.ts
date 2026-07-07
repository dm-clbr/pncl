import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { notifyAdminsOfLicensingComplete } from "../_shared/contractingNotifications.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

/**
 * Called by the portal after an agent saves licensing details. If both NPN and
 * E&O policy number are on file, notifies admins (once) that contracting can
 * be initiated.
 */
serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);

    const { data: profile, error } = await adminClient
      .from("portal_profiles")
      .select("user_id, first_name, last_name, npn, eo_policy_number, eo_certificate_path, licensing_notification_sent_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const npn = profile?.npn?.trim() ?? "";
    const eoPolicyNumber = profile?.eo_policy_number?.trim() ?? "";

    if (!profile || !npn || !eoPolicyNumber) {
      return jsonResponse({ notified: false, reason: "incomplete" });
    }

    if (profile.licensing_notification_sent_at) {
      return jsonResponse({ notified: false, reason: "already_sent" });
    }

    const agentName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim()
      || user.email?.split("@")[0]
      || "Agent";

    const notified = await notifyAdminsOfLicensingComplete(adminClient, {
      userId: user.id,
      agentName,
      agentEmail: user.email ?? "",
      npn,
      eoPolicyNumber,
      hasEoCertificate: Boolean(profile.eo_certificate_path),
    });

    return jsonResponse({ notified });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to send notification";
    logOnboarding("notify_licensing_complete_failed", { error: message }, "error");
    return errorResponse(message, 500, "notify_failed");
  }
});
