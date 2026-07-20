import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { lookupCountyFromZip } from "../_shared/usZipCounty.ts";

/** Editable portal_profiles columns, keyed by the camelCase payload field. */
const EDITABLE_FIELDS: Record<string, string> = {
  firstName: "first_name",
  lastName: "last_name",
  shirtSize: "shirt_size",
  poloShirtSize: "polo_shirt_size",
  hoodieSize: "hoodie_size",
  waistSize: "waist_size",
  shoeSize: "shoe_size",
  addressLine1: "address_line1",
  addressCity: "address_city",
  addressState: "address_state",
  addressZip: "address_zip",
  npn: "npn",
  eoPolicyNumber: "eo_policy_number",
};

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient, user: adminUser } = await requireAdmin(req);
    const body = await req.json();

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return errorResponse("userId is required", 400, "invalid_payload");
    }

    const fields = body.fields;
    if (!fields || typeof fields !== "object") {
      return errorResponse("fields is required", 400, "invalid_payload");
    }

    const updates: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
      if (!(key in fields)) continue;
      const value = (fields as Record<string, unknown>)[key];
      if (value !== null && typeof value !== "string") {
        return errorResponse(`${key} must be a string or null`, 400, "invalid_payload");
      }
      updates[column] = typeof value === "string" ? value.trim() || null : null;
    }

    if ("stateLicenses" in (fields as Record<string, unknown>)) {
      const stateLicenses = (fields as Record<string, unknown>).stateLicenses;
      if (
        !Array.isArray(stateLicenses)
        || stateLicenses.some((state) => typeof state !== "string")
      ) {
        return errorResponse("stateLicenses must be an array of strings", 400, "invalid_payload");
      }
      updates.state_licenses = [...new Set(stateLicenses.map((state) => state.trim().toUpperCase()).filter(Boolean))].sort();
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No editable fields provided", 400, "invalid_payload");
    }

    if (updates.first_name === null || updates.last_name === null) {
      return errorResponse("First and last name cannot be empty", 400, "invalid_payload");
    }

    const { data: existing, error: existingError } = await adminClient
      .from("portal_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing && (!updates.first_name || !updates.last_name)) {
      return errorResponse(
        "This user has no portal profile yet; first and last name are required to create one.",
        400,
        "invalid_payload",
      );
    }

    const current = (existing ?? {}) as Record<string, unknown>;
    const zipForCounty = typeof updates.address_zip === "string"
      ? updates.address_zip
      : typeof current.address_zip === "string"
        ? current.address_zip
        : null;

    if (zipForCounty && /^\d{5}$/.test(zipForCounty.trim())) {
      const county = lookupCountyFromZip(zipForCounty.trim());
      if (!county) {
        return errorResponse(
          "Unable to determine county from that ZIP code",
          400,
          "invalid_payload",
        );
      }
      updates.county = county;
    }

    // Diff against current values so the audit trail records real changes only.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [column, next] of Object.entries(updates)) {
      const previous = current[column] ?? null;
      const same = Array.isArray(next) && Array.isArray(previous)
        ? JSON.stringify(next) === JSON.stringify(previous)
        : previous === next;
      if (!same) {
        changes[column] = { from: previous, to: next };
      }
    }

    if (Object.keys(changes).length === 0) {
      return jsonResponse({ message: "No changes to save." });
    }

    const { error: upsertError } = await adminClient
      .from("portal_profiles")
      .upsert({ user_id: userId, ...updates }, { onConflict: "user_id" });

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    const { error: auditError } = await adminClient
      .from("admin_audit_log")
      .insert({
        admin_user_id: adminUser.id,
        target_user_id: userId,
        action: "profile_updated",
        changes,
      });

    if (auditError) {
      logOnboarding("admin_audit_log_write_failed", { userId, error: auditError.message }, "warn");
    }

    logOnboarding("admin_user_profile_updated", {
      userId,
      adminUserId: adminUser.id,
      fields: Object.keys(changes),
    });

    return jsonResponse({ message: "Profile updated." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update profile";
    logOnboarding("admin_update_user_profile_failed", { error: message }, "error");
    return errorResponse(message, 400, "update_failed");
  }
});
