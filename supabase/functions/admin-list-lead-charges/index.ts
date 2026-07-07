import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { listPortalUsers, resolveDisplayName } from "../_shared/adminAgents.ts";
import type { LeadChargeRecord } from "../_shared/leadCharges.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireAdmin(req);
    const url = new URL(req.url);
    const weekOf = url.searchParams.get("weekOf")?.trim() || null;

    const { data: weekRows, error: weeksError } = await adminClient
      .from("lead_charges")
      .select("week_of")
      .order("week_of", { ascending: false });

    if (weeksError) throw new Error(weeksError.message);

    const weeks = [...new Set(((weekRows ?? []) as { week_of: string }[]).map((row) => row.week_of))];
    const selectedWeek = weekOf ?? weeks[0] ?? null;

    if (!selectedWeek) {
      return jsonResponse({ weeks: [], weekOf: null, charges: [] });
    }

    const { data: chargeRows, error: chargesError } = await adminClient
      .from("lead_charges")
      .select("*")
      .eq("week_of", selectedWeek)
      .order("created_at", { ascending: true });

    if (chargesError) throw new Error(chargesError.message);

    const charges = (chargeRows ?? []) as LeadChargeRecord[];

    const users = await listPortalUsers(adminClient);
    const usersById = new Map(users.map((user) => [user.id, user]));

    const mapped = charges.map((charge) => {
      const user = charge.user_id ? usersById.get(charge.user_id) : undefined;
      return {
        id: charge.id,
        weekOf: charge.week_of,
        userId: charge.user_id,
        portalName: user ? resolveDisplayName(user, null) : null,
        portalEmail: user?.email ?? null,
        agentEmail: charge.agent_email,
        agentName: charge.agent_name,
        description: charge.description,
        amountCents: charge.amount_cents,
        sourceFile: charge.source_file,
      };
    });

    logOnboarding("admin_lead_charges_listed", { weekOf: selectedWeek, rows: mapped.length });

    return jsonResponse({ weeks, weekOf: selectedWeek, charges: mapped });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list lead charges";
    logOnboarding("admin_list_lead_charges_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
