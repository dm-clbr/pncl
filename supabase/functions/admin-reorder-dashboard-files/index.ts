import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { normalizeSectionId } from "../_shared/portalDashboardFiles.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

function validateReorderPayload(body: unknown): { sectionId: string; orderedIds: string[] } {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const sectionId = normalizeSectionId(typeof data.sectionId === "string" ? data.sectionId : "");
  const orderedIds = data.orderedIds;

  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("orderedIds must be an array of file ids");
  }

  return { sectionId, orderedIds: orderedIds.map((id) => id.trim()) };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const { sectionId, orderedIds } = validateReorderPayload(await req.json());
    const now = new Date().toISOString();

    for (let index = 0; index < orderedIds.length; index += 1) {
      const { error } = await adminClient
        .from("portal_dashboard_files")
        .update({ sort_order: index, updated_at: now })
        .eq("id", orderedIds[index])
        .eq("section_id", sectionId);

      if (error) {
        throw new Error(error.message);
      }
    }

    logOnboarding("admin_dashboard_files_reordered", {
      adminId: user.id,
      sectionId,
      count: orderedIds.length,
    });
    return jsonResponse({ message: "File order updated." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to reorder dashboard files";
    logOnboarding("admin_reorder_dashboard_files_failed", { error: message }, "error");
    return errorResponse(message, 500, "reorder_failed");
  }
});
