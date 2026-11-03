import { loadSigningRollout, legacySigningRows } from "../_shared/signingRollout.ts";
import { isTodoApplicableToAgent } from "../_shared/agentDesignation.ts";
import { loadAgentDesignations } from "../_shared/portalAgentDesignations.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { buildAgentSummaries, listPortalUsers } from "../_shared/adminAgents.ts";
import {
  computeAutoCompletionSets,
  getCompletedTodosFromMetadata,
  isTodoCompleteForUser,
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
    const todoRecord = todoRow as PortalTodoRecord;
    const rollout = await loadSigningRollout(adminClient);
    const legacyTodo = legacySigningRows([todoRecord], rollout).find(row => row.slug === todoRecord.slug)!;
    const { data: previewRows, error: previewError } = await adminClient.from("onboarding_signing_preview_users").select("user_id");
    if (previewError) throw new Error(previewError.message);
    const previewUsers = new Set((previewRows ?? []).map(row => row.user_id));
    const { data: compRows, error: compError } = await adminClient.from("portal_comp_attachments").select("user_id");
    if (compError) throw new Error(compError.message);
    const compUsers = new Set((compRows ?? []).map(row => row.user_id));
    const autoKeys = new Set(
      [todoRecord, legacyTodo].filter(row => row.completion_type === "auto" && row.auto_key).map(row => row.auto_key!),
    );
    const autoSets = await computeAutoCompletionSets(
      adminClient,
      autoKeys,
      users.map((user) => user.id),
    );
    const designations = await loadAgentDesignations(adminClient, users.map((user) => user.id));
    const completed = [];
    const pending = [];

    for (const agent of agents) {
      const enabled = rollout.enabled || previewUsers.has(agent.id);
      const effectiveTodo = enabled ? todoRecord : legacyTodo;
      if (!effectiveTodo.published || (!enabled && effectiveTodo.slug === "comp_agreement" && !compUsers.has(agent.id))) continue;
      if (!isTodoApplicableToAgent(effectiveTodo.slug, designations.get(agent.id), effectiveTodo)) continue;
      const user = usersById.get(agent.id);
      const entry = {
        id: agent.id,
        name: agent.name,
        email: agent.email,
      };

      const completedMetadata = getCompletedTodosFromMetadata(
        user?.user_metadata as Record<string, unknown> | undefined,
      );
      const isCompleted = isTodoCompleteForUser(
        effectiveTodo,
        agent.id,
        completedMetadata,
        autoSets,
      );

      if (isCompleted) {
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
      totalUsers: completed.length + pending.length,
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
