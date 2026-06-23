import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import {
  buildAgentSummaries,
  buildHierarchyTree,
  loadPortalProfilePhotos,
} from "../_shared/adminAgents.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireAdmin(req);
    const url = new URL(req.url);
    const rootUserId = url.searchParams.get("root") ?? undefined;

    if (rootUserId && !isValidReferrerUserId(rootUserId)) {
      return errorResponse("Invalid root user id", 400, "invalid_root");
    }

    const [agents, profilesByUserId] = await Promise.all([
      buildAgentSummaries(adminClient),
      loadPortalProfilePhotos(adminClient),
    ]);
    const tree = buildHierarchyTree(agents, rootUserId, profilesByUserId);

    return jsonResponse({ tree, totalAgents: agents.length });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load hierarchy";
    logOnboarding("admin_get_hierarchy_failed", { error: message }, "error");
    return errorResponse(message, 500, "hierarchy_failed");
  }
});
