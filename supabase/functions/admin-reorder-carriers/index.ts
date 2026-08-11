import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

type CarrierOrderUpdate = {
  id: string;
  section?: string;
};

function validateReorderPayload(body: unknown): { orderedCarriers: CarrierOrderUpdate[] } {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const orderedCarriers = data.orderedCarriers;
  if (orderedCarriers === undefined) {
    const orderedIds = data.orderedIds;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0
      || orderedIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw new Error("orderedIds must be a non-empty array of carrier ids");
    }

    const normalizedIds = orderedIds.map((id) => (id as string).trim());
    if (new Set(normalizedIds).size !== normalizedIds.length) {
      throw new Error("orderedIds cannot contain duplicate carrier ids");
    }

    return { orderedCarriers: normalizedIds.map((id) => ({ id })) };
  }

  if (!Array.isArray(orderedCarriers) || orderedCarriers.length === 0) {
    throw new Error("orderedCarriers must be a non-empty array");
  }

  const normalized = orderedCarriers.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Each ordered carrier must include an id and section");
    }

    const id = (item as Record<string, unknown>).id;
    const section = (item as Record<string, unknown>).section;
    if (typeof id !== "string" || !id.trim() || typeof section !== "string") {
      throw new Error("Each ordered carrier must include an id and section");
    }

    return { id: id.trim(), section: section.trim() };
  });

  if (new Set(normalized.map(({ id }) => id)).size !== normalized.length) {
    throw new Error("orderedCarriers cannot contain duplicate carrier ids");
  }

  return { orderedCarriers: normalized };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const { orderedCarriers } = validateReorderPayload(await req.json());
    const now = new Date().toISOString();

    for (let index = 0; index < orderedCarriers.length; index += 1) {
      const carrier = orderedCarriers[index];
      const { error } = await adminClient
        .from("portal_carriers")
        .update({
          sort_order: index,
          ...(carrier.section !== undefined ? { section: carrier.section } : {}),
          updated_at: now,
        })
        .eq("id", carrier.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    logOnboarding("admin_carriers_reordered", { adminId: user.id, count: orderedCarriers.length });
    return jsonResponse({ message: "Carrier order updated." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to reorder carriers";
    logOnboarding("admin_reorder_carriers_failed", { error: message }, "error");
    return errorResponse(message, 500, "reorder_failed");
  }
});
