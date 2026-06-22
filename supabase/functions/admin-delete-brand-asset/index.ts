import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

function validateDeletePayload(body: unknown): { id: string } {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const id = typeof (body as Record<string, unknown>).id === "string"
    ? (body as Record<string, string>).id.trim()
    : "";

  if (!id) {
    throw new Error("Brand asset id is required");
  }

  return { id };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const { id } = validateDeletePayload(await req.json());

    const { error } = await adminClient
      .from("portal_brand_assets")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    logOnboarding("admin_brand_asset_deleted", { adminId: user.id, assetId: id });
    return jsonResponse({ id, message: "Brand asset deleted." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to delete brand asset";
    logOnboarding("admin_delete_brand_asset_failed", { error: message }, "error");
    return errorResponse(message, 500, "delete_failed");
  }
});
