import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { listGenesisAdminEmails } from "../_shared/genesisNotifications.ts";
import {
  mapTicketRecord,
  PORTAL_TICKET_TYPE_LABELS,
  validateSubmitTicketPayload,
  type PortalTicketRecord,
} from "../_shared/portalTickets.ts";
import { sendTicketSubmittedNotificationEmail } from "../_shared/resend.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

function getTicketsAdminUrl(): string {
  const siteUrl = Deno.env.get("PNCL_SITE_URL") ?? "http://localhost:8080";
  return `${siteUrl.replace(/\/$/, "")}/portal/admin/tickets`;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const payload = validateSubmitTicketPayload(await req.json());

    const { data, error } = await adminClient
      .from("portal_tickets")
      .insert({
        user_id: user.id,
        type: payload.type,
        subject: payload.subject,
        description: payload.description,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const ticket = data as PortalTicketRecord;
    logOnboarding("portal_ticket_submitted", { ticketId: ticket.id, type: ticket.type });

    // Best-effort admin notification; the ticket itself is already saved.
    try {
      const recipients = await listGenesisAdminEmails(adminClient);
      const agentName = typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : user.email ?? "An agent";
      const ticketsUrl = getTicketsAdminUrl();

      for (const to of recipients) {
        await sendTicketSubmittedNotificationEmail({
          to,
          agentName,
          agentEmail: user.email ?? "",
          ticketType: PORTAL_TICKET_TYPE_LABELS[ticket.type],
          subject: ticket.subject,
          description: ticket.description,
          ticketsUrl,
        });
      }
    } catch (notifyError) {
      const message = notifyError instanceof Error ? notifyError.message : "notify failed";
      logOnboarding("portal_ticket_notification_failed", { ticketId: ticket.id, error: message }, "warn");
    }

    return jsonResponse({
      message: "Ticket submitted. PNCL will follow up soon.",
      ticket: mapTicketRecord(ticket),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to submit ticket";
    logOnboarding("submit_portal_ticket_failed", { error: message }, "error");
    return errorResponse(message, 400, "submit_failed");
  }
});
