import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { createW9DownloadUrl } from "../_shared/portalW9Documents.ts";
import { mapPortalW9Summary, type PortalW9Record } from "../_shared/portalW9.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);

    const { data, error } = await adminClient
      .from("portal_w9_forms")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return errorResponse("W-9 not found", 404, "not_found");
    }

    const record = data as PortalW9Record;
    const downloadUrl = await createW9DownloadUrl(adminClient, record);

    logOnboarding("portal_w9_document_ready", { userId: user.id });

    return jsonResponse({
      w9: mapPortalW9Summary(record),
      downloadUrl,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load W-9 document";
    logOnboarding("portal_w9_document_failed", { error: message }, "error");
    return errorResponse(message, 500, "document_failed");
  }
});
