import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { buildAgentSummaries } from "../_shared/adminAgents.ts";
import { buildHierarchyExportCsv } from "../_shared/hierarchyExport.ts";
import { corsHeaders, errorResponse, handleCors } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireAdmin(req);

    // POST carries the user IDs currently visible in the admin list, so the
    // export matches whatever search/filters the admin has applied.
    let userIdFilter: Set<string> | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const ids = Array.isArray(body?.userIds)
        ? (body.userIds as unknown[]).filter((id): id is string => typeof id === "string")
        : null;
      if (ids) {
        userIdFilter = new Set(ids);
      }
    }

    const allAgents = await buildAgentSummaries(adminClient);
    const agents = userIdFilter
      ? allAgents.filter((agent) => userIdFilter!.has(agent.id))
      : allAgents;

    const { data: profileRows } = await adminClient
      .from("portal_profiles")
      .select("user_id, state_licenses");
    const stateLicensesByUserId = new Map<string, string[]>(
      ((profileRows ?? []) as { user_id: string; state_licenses: string[] | null }[])
        .map((row) => [row.user_id, row.state_licenses ?? []]),
    );

    const csv = buildHierarchyExportCsv({
      allAgents,
      exportedAgents: agents,
      stateLicensesByUserId,
    });
    const fileName = `pncl-agents-${new Date().toISOString().slice(0, 10)}.csv`;

    logOnboarding("admin_export_agents", { count: agents.length });

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to export agents";
    logOnboarding("admin_export_agents_failed", { error: message }, "error");
    return errorResponse(message, 500, "export_failed");
  }
});
