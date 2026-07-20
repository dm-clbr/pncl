import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  buildNpnUserMatcher,
  mapSetterCloserPolicyRecord,
  type SetterCloserPolicyRecord,
} from "../_shared/setterCloserPolicies.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireAdmin(req);
    const url = new URL(req.url);
    const npn = url.searchParams.get("npn")?.trim().replace(/[^0-9A-Za-z-]/g, "") ?? "";
    const search = url.searchParams.get("search")?.trim().replace(/[%_,]/g, "").slice(0, 80) ?? "";

    let query = adminClient
      .from("setter_closer_policies")
      .select("*")
      .order("policy_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (npn) {
      query = query.or(`closer_npn.eq.${npn},setter_npn.eq.${npn}`);
    } else if (search) {
      const pattern = `%${search}%`;
      query = query.or(
        `policy_number.ilike.${pattern},client_name.ilike.${pattern},carrier.ilike.${pattern},closer_npn.ilike.${pattern},setter_npn.ilike.${pattern}`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const matcher = await buildNpnUserMatcher(adminClient);
    const policies = ((data ?? []) as SetterCloserPolicyRecord[]).map((row) =>
      mapSetterCloserPolicyRecord(row, matcher)
    );

    logOnboarding("admin_setter_closer_policies_listed", { count: policies.length, npn: npn || null });

    return jsonResponse({ policies });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list setter/closer policies";
    logOnboarding("admin_list_setter_closer_policies_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
