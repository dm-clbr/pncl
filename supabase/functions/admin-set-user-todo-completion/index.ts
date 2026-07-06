import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { getCompletedTodosFromMetadata } from "../_shared/portalTodos.ts";
import { logOnboarding } from "../_shared/logger.ts";

interface SetUserTodoCompletionPayload {
  userId: string;
  slug: string;
  completed: boolean;
}

function validatePayload(body: unknown): SetUserTodoCompletionPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  const slug = typeof data.slug === "string" ? data.slug.trim() : "";

  if (!userId) throw new Error("userId is required");
  if (!slug) throw new Error("slug is required");
  if (typeof data.completed !== "boolean") throw new Error("completed must be a boolean");

  return { userId, slug, completed: data.completed };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const payload = validatePayload(await req.json());

    const { data: todoRow, error: todoError } = await adminClient
      .from("portal_todos")
      .select("slug, title")
      .eq("slug", payload.slug)
      .maybeSingle();

    if (todoError) {
      throw new Error(todoError.message);
    }

    if (!todoRow) {
      return errorResponse("To-do not found", 404, "not_found");
    }

    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(
      payload.userId,
    );

    if (userError || !userData.user) {
      return errorResponse("User not found", 404, "user_not_found");
    }

    const completed = getCompletedTodosFromMetadata(
      userData.user.user_metadata as Record<string, unknown> | undefined,
    );

    if (payload.completed) {
      completed[payload.slug] = true;
    } else {
      delete completed[payload.slug];
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(payload.userId, {
      user_metadata: {
        ...userData.user.user_metadata,
        completed_portal_todos: completed,
      },
    });

    if (updateError) {
      throw new Error(updateError.message);
    }

    logOnboarding("admin_set_user_todo_completion", {
      adminId: adminUser.id,
      userId: payload.userId,
      slug: payload.slug,
      completed: payload.completed,
    });

    return jsonResponse({
      userId: payload.userId,
      slug: payload.slug,
      completed: payload.completed,
      message: payload.completed
        ? `"${todoRow.title}" marked complete.`
        : `"${todoRow.title}" marked incomplete.`,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update to-do completion";
    logOnboarding("admin_set_user_todo_completion_failed", { error: message }, "error");
    return errorResponse(message, 500, "update_failed");
  }
});
