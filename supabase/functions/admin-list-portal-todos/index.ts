import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { listPortalUsers } from "../_shared/adminAgents.ts";
import {
  countTodoCompletions,
  mapPortalTodoRecord,
  type PortalTodoRecord,
} from "../_shared/portalTodos.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireAdmin(req);

    const [{ data, error }, users] = await Promise.all([
      adminClient
        .from("portal_todos")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      listPortalUsers(adminClient),
    ]);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as PortalTodoRecord[];
    const slugs = rows.map((row) => row.slug);
    const { totalUsers, completionsBySlug } = countTodoCompletions(users, slugs);

    const todos = rows.map((row) => {
      const mapped = mapPortalTodoRecord(row);
      const completedCount = completionsBySlug[row.slug] ?? 0;
      const completionPercent = totalUsers > 0
        ? Math.round((completedCount / totalUsers) * 100)
        : 0;

      return {
        ...mapped,
        completedCount,
        totalUsers,
        completionPercent,
      };
    });

    return jsonResponse({ todos, totalUsers });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list todos";
    logOnboarding("admin_list_portal_todos_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
