import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { resolveUserIcaStatus } from "../_shared/portalIca.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const status = await resolveUserIcaStatus(adminClient, user.id);

    return jsonResponse(status);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load agreement status";
    logOnboarding("portal_ica_status_failed", { error: message }, "error");
    return errorResponse(message, 500, "status_failed");
  }
});
