import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { submitNewProducer } from "../_shared/newProducerSubmission.ts";
import { notifyAdminsOfNewProducerSubmission } from "../_shared/contractingNotifications.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

// Accept submission only after validating the agent's actual onboarding path.
// The persisted ticket is the completion record; email is an optional alert.
serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const ticketId = await submitNewProducer(adminClient, user);
    let notified = false;
    try {
      const { data: profile, error } = await adminClient.from("portal_profiles")
        .select("first_name, last_name, npn").eq("user_id", user.id).maybeSingle();
      if (error) throw new Error(error.message);
      const agentName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim()
        || user.email?.split("@")[0] || "Agent";
      notified = await notifyAdminsOfNewProducerSubmission(adminClient, {
        userId: user.id, agentName, agentEmail: user.email ?? "", npn: profile?.npn?.trim() ?? "",
      });
    } catch (notifyError) {
      logOnboarding("new_producer_email_failed", { ticketId, error: String(notifyError) }, "warn");
    }
    return jsonResponse({ ticketId, notified });
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    const message = error instanceof Error ? error.message : "Unable to submit for New Producer";
    logOnboarding("notify_new_producer_failed", { error: message }, "error");
    return errorResponse(message, 500, "submit_failed");
  }
});
