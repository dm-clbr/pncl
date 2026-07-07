import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireGenesisAdminOrAdmin(req);
    const body = await req.json();

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const entryBody = typeof body.body === "string" ? body.body.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "policy";
    const sortOrder = Number.isInteger(body.sortOrder) ? body.sortOrder : 0;
    const published = body.published !== false;

    if (!title) {
      return errorResponse("Title is required", 400, "invalid_payload");
    }
    if (!entryBody) {
      return errorResponse("Body is required", 400, "invalid_payload");
    }
    if (!["policy", "faq"].includes(category)) {
      return errorResponse("Category must be policy or faq", 400, "invalid_payload");
    }

    const payload = {
      title,
      body: entryBody,
      category,
      sort_order: sortOrder,
      published,
    };

    const query = id
      ? adminClient.from("portal_pay_policy_entries").update(payload).eq("id", id).select("*").single()
      : adminClient.from("portal_pay_policy_entries").insert(payload).select("*").single();

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    logOnboarding("admin_pay_policy_saved", { entryId: (data as { id: string }).id });

    return jsonResponse({ message: "Entry saved.", entry: data });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to save entry";
    logOnboarding("admin_upsert_pay_policy_failed", { error: message }, "error");
    return errorResponse(message, 400, "save_failed");
  }
});
