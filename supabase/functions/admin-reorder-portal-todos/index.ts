import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

function validateReorderPayload(body: unknown): { orderedIds: string[] } {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const orderedIds = (body as Record<string, unknown>).orderedIds;
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("orderedIds must be an array of to-do ids");
  }

  return { orderedIds: orderedIds.map((id) => id.trim()) };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const { orderedIds } = validateReorderPayload(await req.json());
    const now = new Date().toISOString();

    for (let index = 0; index < orderedIds.length; index += 1) {
      const { error } = await adminClient
        .from("portal_todos")
        .update({ sort_order: index, updated_at: now })
        .eq("id", orderedIds[index]);

      if (error) {
        throw new Error(error.message);
      }
    }

    logOnboarding("admin_portal_todos_reordered", { adminId: user.id, count: orderedIds.length });
    return jsonResponse({ message: "To-do order updated." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to reorder to-dos";
    logOnboarding("admin_reorder_portal_todos_failed", { error: message }, "error");
    return errorResponse(message, 500, "reorder_failed");
  }
});
