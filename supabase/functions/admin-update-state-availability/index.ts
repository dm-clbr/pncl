import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  AdminAuthError,
  requireStateAvailabilityAdmin,
} from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  parseStateAvailabilityUpdates,
  US_STATE_NAMES,
} from "../_shared/stateAvailability.ts";

interface AvailabilityRecord {
  state_code: string;
  state_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient, user: adminUser } = await requireStateAvailabilityAdmin(req);
    const body = await req.json();

    let updates;
    try {
      updates = parseStateAvailabilityUpdates(body?.updates);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "Invalid state updates",
        400,
        "invalid_payload",
      );
    }

    const stateCodes = updates.map((update) => update.stateCode);
    const { data: currentRows, error: currentError } = await adminClient
      .from("portal_state_availability")
      .select("state_code, status")
      .in("state_code", stateCodes);

    if (currentError) throw new Error(currentError.message);

    const currentByCode = new Map(
      ((currentRows ?? []) as Array<{ state_code: string; status: string }>).map((row) => [
        row.state_code,
        row.status,
      ]),
    );

    const changedUpdates = updates.filter(
      (update) => currentByCode.get(update.stateCode) !== update.status,
    );

    if (changedUpdates.length === 0) {
      return jsonResponse({ states: [], message: "No state statuses changed." });
    }

    const rows = changedUpdates.map((update) => ({
      state_code: update.stateCode,
      state_name: US_STATE_NAMES[update.stateCode],
      status: update.status,
      updated_by: adminUser.id,
    }));

    const { data, error } = await adminClient
      .from("portal_state_availability")
      .upsert(rows, { onConflict: "state_code" })
      .select("state_code, state_name, status, created_at, updated_at");

    if (error) throw new Error(error.message);

    const changes = changedUpdates.map((update) => ({
      stateCode: update.stateCode,
      from: currentByCode.get(update.stateCode) ?? null,
      to: update.status,
    }));

    if (changes.length > 0) {
      const { error: auditError } = await adminClient
        .from("admin_audit_log")
        .insert({
          admin_user_id: adminUser.id,
          target_user_id: null,
          action: "state_availability_updated",
          changes: { states: changes },
        });

      if (auditError) {
        logOnboarding("admin_audit_log_write_failed", {
          adminUserId: adminUser.id,
          error: auditError.message,
        }, "warn");
      }
    }

    const states = ((data ?? []) as AvailabilityRecord[])
      .sort((left, right) => left.state_name.localeCompare(right.state_name))
      .map((row) => ({
        stateCode: row.state_code,
        stateName: row.state_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

    logOnboarding("admin_state_availability_updated", {
      adminUserId: adminUser.id,
      states: changes.map((change) => change.stateCode),
    });

    return jsonResponse({
      states,
      message: `${changes.length} state status${changes.length === 1 ? "" : "es"} updated.`,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update state availability";
    logOnboarding("admin_update_state_availability_failed", { error: message }, "error");
    return errorResponse(message, 500, "save_failed");
  }
});
