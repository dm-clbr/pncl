import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import {
  buildLeadChargeUserMatcher,
  matchLeadChargeRow,
  validateWeekOf,
  type LeadChargeUploadRow,
} from "../_shared/leadCharges.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

const MAX_ROWS = 5000;

function parseRows(value: unknown): LeadChargeUploadRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("rows must be a non-empty array");
  }
  if (value.length > MAX_ROWS) {
    throw new Error(`Too many rows (max ${MAX_ROWS})`);
  }

  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`Row ${index + 1} is invalid`);
    }
    const row = raw as Record<string, unknown>;
    const amountCents = Number(row.amountCents);
    if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents)) {
      throw new Error(`Row ${index + 1}: amountCents must be an integer`);
    }

    const agentNumberRaw = row.agentNumber;
    const agentNumber = typeof agentNumberRaw === "number" && Number.isInteger(agentNumberRaw)
      ? agentNumberRaw
      : undefined;

    return {
      email: typeof row.email === "string" ? row.email.trim() : undefined,
      name: typeof row.name === "string" ? row.name.trim() : undefined,
      agentNumber,
      description: typeof row.description === "string" ? row.description.trim() : undefined,
      amountCents,
    };
  });
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient, user } = await requireAdmin(req);
    const body = await req.json();

    const weekOf = validateWeekOf(body.weekOf);
    const rows = parseRows(body.rows);
    const sourceFile = typeof body.sourceFile === "string" ? body.sourceFile.trim() || null : null;

    const matcher = await buildLeadChargeUserMatcher(adminClient);

    const inserts = rows.map((row) => ({
      week_of: weekOf,
      user_id: matchLeadChargeRow(row, matcher),
      agent_email: row.email || null,
      agent_name: row.name || null,
      description: row.description || null,
      amount_cents: row.amountCents,
      source_file: sourceFile,
      uploaded_by: user.id,
    }));

    // Re-uploading a week replaces it, so corrected exports don't double-charge.
    const { error: deleteError } = await adminClient
      .from("lead_charges")
      .delete()
      .eq("week_of", weekOf);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    const { error: insertError } = await adminClient
      .from("lead_charges")
      .insert(inserts);

    if (insertError) {
      throw new Error(insertError.message);
    }

    const matched = inserts.filter((row) => row.user_id).length;
    const unmatched = inserts.length - matched;

    logOnboarding("admin_lead_charges_uploaded", {
      weekOf,
      rows: inserts.length,
      matched,
      unmatched,
    });

    return jsonResponse({
      message: `Uploaded ${inserts.length} charges for week of ${weekOf} (${matched} matched, ${unmatched} unmatched).`,
      matched,
      unmatched,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to upload lead charges";
    logOnboarding("admin_upload_lead_charges_failed", { error: message }, "error");
    return errorResponse(message, 400, "upload_failed");
  }
});
