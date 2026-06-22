import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  mapCarrierRecord,
  type PortalCarrierRecord,
} from "../_shared/portalCarriers.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requirePortalUser(req);
    const { data, error } = await adminClient
      .from("portal_carriers")
      .select("*")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const carriers = (data as PortalCarrierRecord[]).map((row) => {
      const item = mapCarrierRecord(row);
      return {
        id: item.id,
        carrier: item.carrier,
        companyNumber: item.companyNumber,
        eAppLabel: item.eAppLabel,
        eAppUrl: item.eAppUrl,
      };
    });

    return jsonResponse({ carriers });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list carriers";
    logOnboarding("list_portal_carriers_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
