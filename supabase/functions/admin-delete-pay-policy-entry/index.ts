import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireGenesisAdminOrAdmin(req);
    const body = await req.json();

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return errorResponse("id is required", 400, "invalid_payload");
    }

    const { error } = await adminClient
      .from("portal_pay_policy_entries")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    logOnboarding("admin_pay_policy_deleted", { entryId: id });

    return jsonResponse({ message: "Entry deleted." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to delete entry";
    logOnboarding("admin_delete_pay_policy_failed", { error: message }, "error");
    return errorResponse(message, 400, "delete_failed");
  }
});
