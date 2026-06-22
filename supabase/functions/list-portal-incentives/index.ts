import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  mapIncentiveRecord,
  type PortalIncentiveRecord,
} from "../_shared/portalIncentives.ts";
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
      .from("portal_incentives")
      .select("*")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const incentives = (data as PortalIncentiveRecord[]).map((row) => {
      const item = mapIncentiveRecord(row);
      return {
        id: item.id,
        title: item.title,
        type: item.type,
        src: item.src,
        poster: item.poster,
        href: item.href,
      };
    });

    return jsonResponse({ incentives });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list incentives";
    logOnboarding("list_portal_incentives_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
