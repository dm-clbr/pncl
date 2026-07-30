import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

/**
 * Agents mark which carriers they hold contracts with when submitting for New
 * Producer. Marks are stored next to the admin-set application status so PNCL
 * can compare what it submitted against what the agent reports.
 */
serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const body = await req.json();

    const carrierIds = Array.isArray(body?.carrierIds)
      ? [...new Set(
        (body.carrierIds as unknown[])
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          .map((id) => id.trim()),
      )]
      : [];

    if (carrierIds.length === 0) {
      return errorResponse("Select at least one carrier", 400, "invalid_payload");
    }

    const { data: carrierRows, error: carrierError } = await adminClient
      .from("portal_carriers")
      .select("id")
      .eq("published", true)
      .in("id", carrierIds);

    if (carrierError) {
      throw new Error(carrierError.message);
    }

    const validIds = ((carrierRows ?? []) as { id: string }[]).map((row) => row.id);
    if (validIds.length === 0) {
      return errorResponse("No matching carriers found", 404, "not_found");
    }

    const now = new Date().toISOString();
    const { error } = await adminClient
      .from("portal_carrier_statuses")
      .upsert(
        validIds.map((carrierId) => ({
          user_id: user.id,
          carrier_id: carrierId,
          contract_confirmed_at: now,
        })),
        { onConflict: "user_id,carrier_id" },
      );

    if (error) {
      throw new Error(error.message);
    }

    logOnboarding("portal_carrier_contracts_confirmed", {
      userId: user.id,
      carrierCount: validIds.length,
    });

    return jsonResponse({
      message: "Carrier contracts confirmed.",
      carrierIds: validIds,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to confirm carrier contracts";
    logOnboarding("portal_carrier_contracts_confirm_failed", { error: message }, "error");
    return errorResponse(message, 500, "save_failed");
  }
});
