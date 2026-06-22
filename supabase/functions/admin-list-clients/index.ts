import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { buildAgentSummaries } from "../_shared/adminAgents.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

interface PortalClientRow {
  id: string;
  agent_user_id: string;
  primary_first_name: string;
  primary_last_name: string;
  primary_phone: string | null;
  primary_email: string | null;
  address: string | null;
  date_met: string | null;
  created_at: string;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireAdmin(req);
    const agents = await buildAgentSummaries(adminClient);
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));

    const { data, error } = await adminClient
      .from("portal_clients")
      .select(
        "id, agent_user_id, primary_first_name, primary_last_name, primary_phone, primary_email, address, date_met, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const clients = ((data ?? []) as PortalClientRow[]).map((row) => {
      const agent = agentById.get(row.agent_user_id);
      return {
        id: row.id,
        primaryFirstName: row.primary_first_name,
        primaryLastName: row.primary_last_name,
        primaryPhone: row.primary_phone,
        primaryEmail: row.primary_email,
        address: row.address,
        dateMet: row.date_met,
        agentId: row.agent_user_id,
        agentName: agent?.name ?? "Unknown agent",
        agentEmail: agent?.email ?? "",
        createdAt: row.created_at,
      };
    });

    return jsonResponse({ clients });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list clients";
    logOnboarding("admin_list_clients_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
