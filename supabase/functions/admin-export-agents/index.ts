import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { buildAgentSummaries, type AgentSummary } from "../_shared/adminAgents.ts";
import { corsHeaders, errorResponse, handleCors } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

const PHASE_LABELS: Record<string, string> = {
  on_board: "On-Board",
  pre_license: "Pre-License",
  licensing: "Licensing",
  sales_ready: "Sales Ready",
  complete: "Complete",
};

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatAgentNumber(agentNumber: number | null): string {
  if (agentNumber === null) return "";
  return `PNCL-${String(agentNumber).padStart(5, "0")}`;
}

/** Total downline size (all descendants) per user, from referrer links. */
function computeDownlineCounts(agents: AgentSummary[]): Map<string, number> {
  const childrenByReferrer = new Map<string, string[]>();
  for (const agent of agents) {
    if (!agent.referrerId) continue;
    const children = childrenByReferrer.get(agent.referrerId) ?? [];
    children.push(agent.id);
    childrenByReferrer.set(agent.referrerId, children);
  }

  const counts = new Map<string, number>();
  const countDescendants = (id: string, seen: Set<string>): number => {
    if (counts.has(id)) return counts.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);

    let total = 0;
    for (const childId of childrenByReferrer.get(id) ?? []) {
      total += 1 + countDescendants(childId, seen);
    }
    counts.set(id, total);
    return total;
  };

  for (const agent of agents) {
    countDescendants(agent.id, new Set());
  }
  return counts;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireGenesisAdminOrAdmin(req);
    const agents = await buildAgentSummaries(adminClient);

    const { data: profileRows } = await adminClient
      .from("portal_profiles")
      .select("user_id, state_licenses");
    const stateLicensesByUserId = new Map<string, string[]>(
      ((profileRows ?? []) as { user_id: string; state_licenses: string[] | null }[])
        .map((row) => [row.user_id, row.state_licenses ?? []]),
    );

    const downlineCounts = computeDownlineCounts(agents);

    const header = [
      "Name",
      "Email",
      "Agent #",
      "NPN",
      "Phase",
      "Upline",
      "Downline count",
      "Comp level",
      "State licenses",
      "Status",
      "Joined",
    ];

    const rows = agents.map((agent) => [
      csvEscape(agent.name),
      csvEscape(agent.email),
      csvEscape(formatAgentNumber(agent.agentNumber)),
      csvEscape(agent.npn),
      csvEscape(agent.phase ? PHASE_LABELS[agent.phase] ?? agent.phase : ""),
      csvEscape(agent.referrerName ?? agent.uplineNetwork),
      csvEscape(downlineCounts.get(agent.id) ?? 0),
      csvEscape(agent.compLevel !== null ? `${agent.compLevel}%` : ""),
      csvEscape((stateLicensesByUserId.get(agent.id) ?? []).join(" ")),
      csvEscape(agent.emailConfirmed ? "Active" : "Pending activation"),
      csvEscape(agent.createdAt.slice(0, 10)),
    ].join(","));

    const csv = [header.map(csvEscape).join(","), ...rows].join("\r\n");
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
