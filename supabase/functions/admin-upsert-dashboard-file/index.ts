import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import {
  mapDashboardFileRecord,
  type PortalDashboardFileRecord,
  validateUpsertDashboardFilePayload,
} from "../_shared/portalDashboardFiles.ts";
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
    const payload = validateUpsertDashboardFilePayload(await req.json());
    const now = new Date().toISOString();

    const { data: section, error: sectionError } = await adminClient
      .from("portal_dashboard_sections")
      .select("id, section_type")
      .eq("id", payload.sectionId)
      .maybeSingle();

    if (sectionError) {
      throw new Error(sectionError.message);
    }

    if (!section) {
      return errorResponse("Dashboard tab not found", 404, "section_not_found");
    }

    if (section.section_type !== "downloads") {
      return errorResponse("This tab is not a downloads tab", 400, "invalid_section_type");
    }

    if (payload.id) {
      const { data, error } = await adminClient
        .from("portal_dashboard_files")
        .update({
          title: payload.title,
          description: payload.description,
          url: payload.url,
          file_name: payload.fileName,
          content_type: payload.contentType,
          published: payload.published,
          ...(payload.sortOrder !== undefined ? { sort_order: payload.sortOrder } : {}),
          updated_at: now,
        })
        .eq("id", payload.id)
        .select("*")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      logOnboarding("admin_dashboard_file_updated", { adminId: user.id, fileId: payload.id });
      return jsonResponse({
        file: mapDashboardFileRecord(data as PortalDashboardFileRecord),
        message: "File updated.",
      });
    }

    let sortOrder = payload.sortOrder;
    if (sortOrder === undefined) {
      const { count, error: countError } = await adminClient
        .from("portal_dashboard_files")
        .select("*", { count: "exact", head: true })
        .eq("section_id", payload.sectionId);
      if (countError) {
        throw new Error(countError.message);
      }
      sortOrder = count ?? 0;
    }

    const { data, error } = await adminClient
      .from("portal_dashboard_files")
      .insert({
        section_id: payload.sectionId,
        title: payload.title,
        description: payload.description,
        url: payload.url,
        file_name: payload.fileName,
        content_type: payload.contentType,
        published: payload.published,
        sort_order: sortOrder,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    logOnboarding("admin_dashboard_file_created", { adminId: user.id, fileId: data.id });
    return jsonResponse({
      file: mapDashboardFileRecord(data as PortalDashboardFileRecord),
      message: "File added.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to save dashboard file";
    logOnboarding("admin_upsert_dashboard_file_failed", { error: message }, "error");
    return errorResponse(message, 500, "save_failed");
  }
});
