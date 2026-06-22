import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

function validateId(body: unknown): string {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const id = (body as Record<string, unknown>).id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Section id is required");
  }
  return id.trim();
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const id = validateId(await req.json());

    const { error } = await adminClient
      .from("portal_dashboard_sections")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    logOnboarding("admin_dashboard_section_deleted", { adminId: user.id, sectionId: id });
    return jsonResponse({ id, message: "Dashboard tab deleted." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to delete dashboard tab";
    logOnboarding("admin_delete_dashboard_section_failed", { error: message }, "error");
    return errorResponse(message, 500, "delete_failed");
  }
});
