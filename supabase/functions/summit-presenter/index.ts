import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { processSummitQuestions } from "../_shared/summitWorker.ts";
import { UUID } from "../_shared/summitRules.ts";

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { adminClient } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    if (body.action === "originals") {
      if (body.group_id !== null && (typeof body.group_id !== "string" || !UUID.test(body.group_id))) return errorResponse("Invalid group",400);
      const cursor = body.cursor;
      if (cursor && (typeof cursor.time !== "string" || !Number.isFinite(Date.parse(cursor.time)) || !UUID.test(cursor.id))) return errorResponse("Invalid cursor",400);
      const { data, error } = await adminClient.rpc("summit_originals",{p_group_id:body.group_id,p_after_time:cursor?.time ?? null,p_after_id:cursor?.id ?? null});
      if (error) throw new Error("originals_failed");
      const response = jsonResponse(data);
      response.headers.set("Cache-Control","no-store");
      return response;
    }
    const { data, error } = await adminClient.rpc("summit_snapshot_v2",{p_known_revision:typeof body.revision === "string" ? body.revision : null});
    if (error) throw new Error("snapshot_failed");
    if (data.pending_count > 0) EdgeRuntime.waitUntil(processSummitQuestions(adminClient));
    const response = jsonResponse({ ...data, ai_configured: Boolean(Deno.env.get("OPENAI_API_KEY")) });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    return errorResponse("Questions couldn’t be loaded. Retrying shortly.", 503);
  }
});
