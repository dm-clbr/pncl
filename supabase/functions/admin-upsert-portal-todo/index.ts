import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import {
  mapPortalTodoRecord,
  type PortalTodoRecord,
  validateUpsertPortalTodoPayload,
} from "../_shared/portalTodos.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const payload = validateUpsertPortalTodoPayload(await req.json());
    const now = new Date().toISOString();

    if (payload.id) {
      const { data, error } = await adminClient
        .from("portal_todos")
        .update({
          slug: payload.slug,
          title: payload.title,
          description: payload.description,
          href: payload.href,
          external: payload.external ?? true,
          action_label: payload.actionLabel,
          show_email_hint: payload.showEmailHint ?? true,
          published: payload.published ?? true,
          phase: payload.phase,
          completion_type: payload.completionType,
          auto_key: payload.autoKey,
          gated: payload.gated ?? false,
          ...(payload.sortOrder !== undefined ? { sort_order: payload.sortOrder } : {}),
          updated_at: now,
        })
        .eq("id", payload.id)
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          return errorResponse("A to-do with that slug already exists", 409, "duplicate_slug");
        }
        throw new Error(error.message);
      }

      logOnboarding("admin_portal_todo_updated", { adminId: user.id, todoId: payload.id });
      return jsonResponse({
        todo: mapPortalTodoRecord(data as PortalTodoRecord),
        message: "To-do updated.",
      });
    }

    let sortOrder = payload.sortOrder;
    if (sortOrder === undefined) {
      const { count, error: countError } = await adminClient
        .from("portal_todos")
        .select("*", { count: "exact", head: true });
      if (countError) {
        throw new Error(countError.message);
      }
      sortOrder = count ?? 0;
    }

    const { data, error } = await adminClient
      .from("portal_todos")
      .insert({
        slug: payload.slug,
        title: payload.title,
        description: payload.description,
        href: payload.href,
        external: payload.external ?? true,
        action_label: payload.actionLabel,
        show_email_hint: payload.showEmailHint ?? true,
        published: payload.published ?? true,
        phase: payload.phase,
        completion_type: payload.completionType,
        auto_key: payload.autoKey,
        gated: payload.gated ?? false,
        sort_order: sortOrder,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse("A to-do with that slug already exists", 409, "duplicate_slug");
      }
      throw new Error(error.message);
    }

    logOnboarding("admin_portal_todo_created", { adminId: user.id, todoId: data.id });
    return jsonResponse({
      todo: mapPortalTodoRecord(data as PortalTodoRecord),
      message: "To-do created.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to save to-do";
    logOnboarding("admin_upsert_portal_todo_failed", { error: message }, "error");
    return errorResponse(message, 500, "save_failed");
  }
});
