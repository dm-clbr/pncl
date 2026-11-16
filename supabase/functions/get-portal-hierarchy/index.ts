import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { loadPortalHierarchy } from "../_shared/portalHierarchyData.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  try {
    const { user, adminClient } = await requirePortalUser(req);
    // Query parameters cannot expand this scope, even for an administrator.
    const response = jsonResponse(await loadPortalHierarchy(adminClient, user.id));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Vary", "Authorization, Origin");
    return response;
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    logOnboarding("portal_hierarchy_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    }, "error");
    return errorResponse("Unable to load your team hierarchy. Please try again.", 500, "hierarchy_failed");
  }
});
