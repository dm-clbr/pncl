import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";

    if (!id) {
      return errorResponse("File id is required", 400, "missing_id");
    }

    const { error } = await adminClient
      .from("portal_dashboard_files")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    logOnboarding("admin_dashboard_file_deleted", { adminId: user.id, fileId: id });
    return jsonResponse({ id, message: "File deleted." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to delete dashboard file";
    logOnboarding("admin_delete_dashboard_file_failed", { error: message }, "error");
    return errorResponse(message, 500, "delete_failed");
  }
});
