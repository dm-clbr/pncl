import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { buildAgentSummaries, listPortalUsers } from "../_shared/adminAgents.ts";
import {
  isPortalTodoCompletedForUser,
  mapPortalTodoRecord,
  type PortalTodoRecord,
  validateTodoCompletionQuery,
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
    const { todoId } = validateTodoCompletionQuery(new URL(req.url));

    const { data: todoRow, error: todoError } = await adminClient
      .from("portal_todos")
      .select("*")
      .eq("id", todoId)
      .maybeSingle();

    if (todoError) {
      throw new Error(todoError.message);
    }

    if (!todoRow) {
      return errorResponse("To-do not found", 404, "not_found");
    }

    const todo = mapPortalTodoRecord(todoRow as PortalTodoRecord);
    const [users, agents] = await Promise.all([
      listPortalUsers(adminClient),
      buildAgentSummaries(adminClient),
    ]);

    const usersById = new Map(users.map((user) => [user.id, user]));
    const completed = [];
    const pending = [];

    for (const agent of agents) {
      const user = usersById.get(agent.id);
      const entry = {
        id: agent.id,
        name: agent.name,
        email: agent.email,
      };

      if (user && isPortalTodoCompletedForUser(user, todo.slug)) {
        completed.push(entry);
      } else {
        pending.push(entry);
      }
    }

    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    completed.sort(byName);
    pending.sort(byName);

    return jsonResponse({
      todo: {
        id: todo.id,
        slug: todo.slug,
        title: todo.title,
      },
      completed,
      pending,
      totalUsers: agents.length,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load completion details";
    logOnboarding("admin_get_portal_todo_completion_failed", { error: message }, "error");
    return errorResponse(message, 500, "load_failed");
  }
});
