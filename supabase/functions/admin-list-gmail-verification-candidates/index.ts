import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { listGmailVerificationCandidates } from "../_shared/gmailVerificationNotifications.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const candidates = await listGmailVerificationCandidates(adminClient);

    logOnboarding("admin_list_gmail_verification_candidates", {
      adminId: adminUser.id,
      count: candidates.length,
    });

    return jsonResponse({ candidates });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list Gmail verification candidates";
    logOnboarding("admin_list_gmail_verification_candidates_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
