import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  mapBrandAssetRecord,
  type PortalBrandAssetRecord,
} from "../_shared/portalBrandAssets.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requirePortalUser(req);

    const { data, error } = await adminClient
      .from("portal_brand_assets")
      .select("*")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const assets = (data as PortalBrandAssetRecord[]).map((row) => {
      const item = mapBrandAssetRecord(row);
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        url: item.url,
        fileName: item.fileName,
        contentType: item.contentType,
      };
    });

    return jsonResponse({ assets });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list brand assets";
    logOnboarding("list_portal_brand_assets_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
