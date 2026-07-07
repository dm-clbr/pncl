import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { listPortalUsers, resolveDisplayName } from "../_shared/adminAgents.ts";
import { mapTicketRecord, type PortalTicketRecord } from "../_shared/portalTickets.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { getUserRole } from "../_shared/adminAuth.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireGenesisAdminOrAdmin(req);

    const [{ data, error }, users] = await Promise.all([
      adminClient
        .from("portal_tickets")
        .select("*")
        .order("created_at", { ascending: false }),
      listPortalUsers(adminClient),
    ]);

    if (error) {
      throw new Error(error.message);
    }

    const usersById = new Map(users.map((user) => [user.id, user]));

    const tickets = ((data ?? []) as PortalTicketRecord[]).map((row) => {
      const agent = usersById.get(row.user_id);
      const assignee = row.assigned_to ? usersById.get(row.assigned_to) : undefined;
      return {
        ...mapTicketRecord(row),
        agentName: agent ? resolveDisplayName(agent, null) : "Unknown agent",
        agentEmail: agent?.email ?? null,
        assignedToName: assignee ? resolveDisplayName(assignee, null) : null,
      };
    });

    const admins = users
      .filter((user) => {
        const role = getUserRole(user);
        return role === "admin" || role === "genesis_admin";
      })
      .map((user) => ({ id: user.id, name: resolveDisplayName(user, null), email: user.email ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse({ tickets, admins });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list tickets";
    logOnboarding("admin_list_tickets_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
