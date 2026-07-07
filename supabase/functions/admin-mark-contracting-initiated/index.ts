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
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const body = await req.json();

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return errorResponse("userId is required", 400, "invalid_request");
    }
    const initiated = body.initiated !== false;

    const { data: existing, error: existingError } = await adminClient
      .from("portal_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    const columns = initiated
      ? {
          contracting_initiated_at: new Date().toISOString(),
          contracting_initiated_by: adminUser.id,
        }
      : {
          contracting_initiated_at: null,
          contracting_initiated_by: null,
        };

    if (existing) {
      const { error } = await adminClient
        .from("portal_profiles")
        .update(columns)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { data: targetUser, error: userError } = await adminClient.auth.admin.getUserById(userId);
      if (userError || !targetUser.user) {
        return errorResponse("User not found", 404, "not_found");
      }
      const fullName = typeof targetUser.user.user_metadata?.full_name === "string"
        ? targetUser.user.user_metadata.full_name.trim()
        : "";
      const [firstName = "", ...rest] = fullName.split(/\s+/).filter(Boolean);
      const { error } = await adminClient
        .from("portal_profiles")
        .insert({
          user_id: userId,
          first_name: firstName,
          last_name: rest.join(" "),
          ...columns,
        });
      if (error) throw new Error(error.message);
    }

    logOnboarding("contracting_initiated_updated", {
      userId,
      initiated,
      adminId: adminUser.id,
    });

    return jsonResponse({
      message: initiated
        ? "Marked as contracting initiated."
        : "Contracting initiation cleared.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update contracting status";
    logOnboarding("contracting_initiated_update_failed", { error: message }, "error");
    return errorResponse(message, 400, "update_failed");
  }
});
