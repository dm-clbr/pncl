import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { listPortalUsers } from "../_shared/adminAgents.ts";
import {
  computeAutoCompletionSets,
  getCompletedTodosFromMetadata,
  isTodoCompleteForUser,
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
    const userIds = users.map((user) => user.id);
    const autoKeys = new Set(
      rows
        .filter((row) => row.completion_type === "auto" && row.auto_key)
        .map((row) => row.auto_key as string),
    );
    const autoSets = await computeAutoCompletionSets(adminClient, autoKeys, userIds);

    const completedMetadataByUser = new Map(
      users.map((user) => [
        user.id,
        getCompletedTodosFromMetadata(user.user_metadata as Record<string, unknown> | undefined),
      ]),
    );

    const totalUsers = users.length;
    const todos = rows.map((row) => {
      let completedCount = 0;
      for (const user of users) {
        const completedMetadata = completedMetadataByUser.get(user.id) ?? {};
        if (isTodoCompleteForUser(row, user.id, completedMetadata, autoSets)) {
          completedCount += 1;
        }
      }

      const completionPercent = totalUsers > 0
        ? Math.round((completedCount / totalUsers) * 100)
        : 0;

      return {
        ...mapPortalTodoRecord(row),
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
