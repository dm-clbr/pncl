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
    const { adminClient, user: adminUser } = await requireGenesisAdminOrAdmin(req);
    const body = await req.json();

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const carrierId = typeof body.carrierId === "string" ? body.carrierId.trim() : "";
    const submitted = Boolean(body.submitted);

    if (!userId || !carrierId) {
      return errorResponse("userId and carrierId are required", 400, "invalid_payload");
    }

    const { error } = await adminClient
      .from("portal_carrier_statuses")
      .upsert(
        {
          user_id: userId,
          carrier_id: carrierId,
          application_submitted_at: submitted ? new Date().toISOString() : null,
          marked_by: adminUser.id,
        },
        { onConflict: "user_id,carrier_id" },
      );

    if (error) {
      throw new Error(error.message);
    }

    logOnboarding("admin_carrier_status_set", { userId, carrierId, submitted });

    return jsonResponse({
      message: submitted
        ? "Carrier application marked as submitted."
        : "Carrier application status cleared.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update carrier status";
    logOnboarding("admin_set_carrier_status_failed", { error: message }, "error");
    return errorResponse(message, 400, "update_failed");
  }
});
