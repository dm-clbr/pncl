import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import {
  mapBrandAssetRecord,
  type PortalBrandAssetRecord,
} from "../_shared/portalBrandAssets.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireAdmin(req);
    const { data, error } = await adminClient
      .from("portal_brand_assets")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const assets = (data as PortalBrandAssetRecord[]).map(mapBrandAssetRecord);
    return jsonResponse({ assets });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list brand assets";
    logOnboarding("admin_list_brand_assets_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
