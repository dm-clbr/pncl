import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import {
  mapBrandAssetRecord,
  type PortalBrandAssetRecord,
  validateUpsertBrandAssetPayload,
} from "../_shared/portalBrandAssets.ts";
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
    const payload = validateUpsertBrandAssetPayload(await req.json());
    const now = new Date().toISOString();

    if (payload.id) {
      const { data, error } = await adminClient
        .from("portal_brand_assets")
        .update({
          title: payload.title,
          description: payload.description,
          url: payload.url,
          file_name: payload.fileName,
          content_type: payload.contentType,
          published: payload.published,
          ...(payload.sortOrder !== undefined ? { sort_order: payload.sortOrder } : {}),
          updated_at: now,
        })
        .eq("id", payload.id)
        .select("*")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      logOnboarding("admin_brand_asset_updated", { adminId: user.id, assetId: payload.id });
      return jsonResponse({
        asset: mapBrandAssetRecord(data as PortalBrandAssetRecord),
        message: "Brand asset updated.",
      });
    }

    let sortOrder = payload.sortOrder;
    if (sortOrder === undefined) {
      const { count, error: countError } = await adminClient
        .from("portal_brand_assets")
        .select("*", { count: "exact", head: true });
      if (countError) {
        throw new Error(countError.message);
      }
      sortOrder = count ?? 0;
    }

    const { data, error } = await adminClient
      .from("portal_brand_assets")
      .insert({
        title: payload.title,
        description: payload.description,
        url: payload.url,
        file_name: payload.fileName,
        content_type: payload.contentType,
        published: payload.published,
        sort_order: sortOrder,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    logOnboarding("admin_brand_asset_created", { adminId: user.id, assetId: data.id });
    return jsonResponse({
      asset: mapBrandAssetRecord(data as PortalBrandAssetRecord),
      message: "Brand asset created.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to save brand asset";
    logOnboarding("admin_upsert_brand_asset_failed", { error: message }, "error");
    return errorResponse(message, 500, "save_failed");
  }
});
