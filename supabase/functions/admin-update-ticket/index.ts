import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import {
  mapTicketRecord,
  PORTAL_TICKET_STATUSES,
  type PortalTicketRecord,
} from "../_shared/portalTickets.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireGenesisAdminOrAdmin(req);
    const body = await req.json();

    const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
    if (!ticketId) {
      return errorResponse("ticketId is required", 400, "invalid_payload");
    }

    const updates: Record<string, unknown> = {};

    if ("status" in body) {
      const status = typeof body.status === "string" ? body.status.trim() : "";
      if (!(PORTAL_TICKET_STATUSES as readonly string[]).includes(status)) {
        return errorResponse("Invalid status", 400, "invalid_payload");
      }
      updates.status = status;
    }

    if ("assignedTo" in body) {
      const assignedTo = body.assignedTo;
      if (assignedTo !== null && typeof assignedTo !== "string") {
        return errorResponse("assignedTo must be a user id or null", 400, "invalid_payload");
      }
      updates.assigned_to = assignedTo === null ? null : assignedTo.trim() || null;
    }

    if ("resolution" in body) {
      const resolution = body.resolution;
      if (resolution !== null && typeof resolution !== "string") {
        return errorResponse("resolution must be a string or null", 400, "invalid_payload");
      }
      updates.resolution = typeof resolution === "string" ? resolution.trim() || null : null;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No changes provided", 400, "invalid_payload");
    }

    const { data, error } = await adminClient
      .from("portal_tickets")
      .update(updates)
      .eq("id", ticketId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    logOnboarding("admin_ticket_updated", { ticketId, fields: Object.keys(updates) });

    return jsonResponse({
      message: "Ticket updated.",
      ticket: mapTicketRecord(data as PortalTicketRecord),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update ticket";
    logOnboarding("admin_update_ticket_failed", { error: message }, "error");
    return errorResponse(message, 400, "update_failed");
  }
});
