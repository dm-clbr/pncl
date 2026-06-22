import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  mapCarrierRecord,
  type PortalCarrierRecord,
  validateUpsertCarrierPayload,
} from "../_shared/portalCarriers.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const payload = validateUpsertCarrierPayload(await req.json());
    const now = new Date().toISOString();

    if (payload.id) {
      const { data, error } = await adminClient
        .from("portal_carriers")
        .update({
          carrier: payload.carrier,
          company_number: payload.companyNumber,
          e_app_label: payload.eAppLabel,
          e_app_url: payload.eAppUrl,
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

      logOnboarding("admin_carrier_updated", { adminId: user.id, carrierId: payload.id });
      return jsonResponse({
        carrier: mapCarrierRecord(data as PortalCarrierRecord),
        message: "Carrier updated.",
      });
    }

    let sortOrder = payload.sortOrder;
    if (sortOrder === undefined) {
      const { count, error: countError } = await adminClient
        .from("portal_carriers")
        .select("*", { count: "exact", head: true });
      if (countError) {
        throw new Error(countError.message);
      }
      sortOrder = count ?? 0;
    }

    const { data, error } = await adminClient
      .from("portal_carriers")
      .insert({
        carrier: payload.carrier,
        company_number: payload.companyNumber,
        e_app_label: payload.eAppLabel,
        e_app_url: payload.eAppUrl,
        published: payload.published,
        sort_order: sortOrder,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    logOnboarding("admin_carrier_created", { adminId: user.id, carrierId: data.id });
    return jsonResponse({
      carrier: mapCarrierRecord(data as PortalCarrierRecord),
      message: "Carrier created.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to save carrier";
    logOnboarding("admin_upsert_carrier_failed", { error: message }, "error");
    return errorResponse(message, 500, "save_failed");
  }
});
