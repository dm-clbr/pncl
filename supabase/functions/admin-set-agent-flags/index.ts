import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { AGENT_FLAG_COLUMNS, type AgentFlags } from "../_shared/agentFlags.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient, user: adminUser } = await requireAdmin(req);
    const body = await req.json();

    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return errorResponse("userId is required", 400, "invalid_payload");
    }

    const flags = body?.flags;
    if (!flags || typeof flags !== "object") {
      return errorResponse("flags is required", 400, "invalid_payload");
    }

    const updates: Record<string, boolean> = {};
    for (const [key, column] of Object.entries(AGENT_FLAG_COLUMNS)) {
      if (!(key in (flags as Record<string, unknown>))) continue;
      const value = (flags as Record<string, unknown>)[key];
      if (typeof value !== "boolean") {
        return errorResponse(`${key} must be a boolean`, 400, "invalid_payload");
      }
      updates[column] = value;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No flags provided", 400, "invalid_payload");
    }

    const { data, error } = await adminClient
      .from("portal_agent_flags")
      .upsert(
        { user_id: userId, ...updates, updated_by: adminUser.id },
        { onConflict: "user_id" },
      )
      .select("lead_assist, company_funded, jeremy_funded")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const { error: auditError } = await adminClient
      .from("admin_audit_log")
      .insert({
        admin_user_id: adminUser.id,
        target_user_id: userId,
        action: "agent_flags_updated",
        changes: updates,
      });

    if (auditError) {
      logOnboarding("admin_audit_log_write_failed", { userId, error: auditError.message }, "warn");
    }

    logOnboarding("admin_agent_flags_updated", {
      userId,
      adminUserId: adminUser.id,
      flags: Object.keys(updates),
    });

    const row = data as Record<string, boolean>;
    const result: AgentFlags = {
      leadAssist: row.lead_assist ?? false,
      companyFunded: row.company_funded ?? false,
      jeremyFunded: row.jeremy_funded ?? false,
    };

    return jsonResponse({ flags: result, message: "Agent flags updated." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update agent flags";
    logOnboarding("admin_set_agent_flags_failed", { error: message }, "error");
    return errorResponse(message, 500, "save_failed");
  }
});
