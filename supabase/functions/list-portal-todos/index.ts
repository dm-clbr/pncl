import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  mapPortalTodoForUser,
  type PortalTodoRecord,
} from "../_shared/portalTodos.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requirePortalUser(req);

    const { data, error } = await adminClient
      .from("portal_todos")
      .select("*")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const todos = (data as PortalTodoRecord[]).map(mapPortalTodoForUser);
    return jsonResponse({ todos });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list to-dos";
    logOnboarding("list_portal_todos_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
