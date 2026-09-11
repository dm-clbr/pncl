import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { syncPortalRecoveryEmailForUser } from "../_shared/portalRecoveryEmail.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const body = await req.json();
    const result = await syncPortalRecoveryEmailForUser(adminClient, user, body?.recoveryEmail);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    const message = error instanceof Error ? error.message : "Unable to sync recovery email";
    logOnboarding("portal_recovery_email_sync_request_failed", { message }, "error");
    return errorResponse(message, 400, "recovery_email_sync_failed");
  }
});
