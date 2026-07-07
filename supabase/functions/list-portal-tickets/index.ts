import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { mapTicketRecord, type PortalTicketRecord } from "../_shared/portalTickets.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);

    const { data, error } = await adminClient
      .from("portal_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const tickets = ((data ?? []) as PortalTicketRecord[]).map(mapTicketRecord);
    return jsonResponse({ tickets });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list tickets";
    logOnboarding("list_portal_tickets_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
