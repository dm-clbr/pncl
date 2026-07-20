import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { notifyAdminsOfNewProducerSubmission } from "../_shared/contractingNotifications.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

/**
 * Called by the portal when an agent checks off the "Submit for New Producer"
 * step. Notifies admins (once) so the agent's profile can be built in PLG's
 * back-end system.
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
      .select("user_id, first_name, last_name, npn")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const agentName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim()
      || user.email?.split("@")[0]
      || "Agent";

    const notified = await notifyAdminsOfNewProducerSubmission(adminClient, {
      userId: user.id,
      agentName,
      agentEmail: user.email ?? "",
      npn: profile?.npn?.trim() ?? "",
    });

    return jsonResponse({ notified });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to send notification";
    logOnboarding("notify_new_producer_failed", { error: message }, "error");
    return errorResponse(message, 500, "notify_failed");
  }
});
