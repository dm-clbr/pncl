import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  createIcaDownloadUrl,
  resolveUserIcaStatus,
} from "../_shared/portalIca.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const status = await resolveUserIcaStatus(adminClient, user.id);

    if (!status.signed || !status.ica) {
      return errorResponse("Agreement not found", 404, "not_found");
    }

    const downloadUrl = await createIcaDownloadUrl(adminClient, status);
    if (!downloadUrl) {
      return errorResponse("Unable to create download link", 500, "document_failed");
    }

    logOnboarding("portal_ica_document_ready", {
      userId: user.id,
      source: status.source,
    });

    return jsonResponse({
      ica: status.ica,
      source: status.source,
      downloadUrl,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load agreement document";
    logOnboarding("portal_ica_document_failed", { error: message }, "error");
    return errorResponse(message, 500, "document_failed");
  }
});
