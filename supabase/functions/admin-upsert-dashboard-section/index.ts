import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import {
  mapDashboardSectionRecord,
  type PortalDashboardSectionRecord,
  validateUpsertDashboardSectionPayload,
} from "../_shared/portalDashboardTabs.ts";
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
    const payload = validateUpsertDashboardSectionPayload(await req.json());
    const now = new Date().toISOString();

    const { data: existing } = await adminClient
      .from("portal_dashboard_sections")
      .select("id")
      .eq("id", payload.id)
      .maybeSingle();

    if (existing) {
      const { data, error } = await adminClient
        .from("portal_dashboard_sections")
        .update({
          title: payload.title,
          published: payload.published,
          ...(payload.sortOrder !== undefined ? { sort_order: payload.sortOrder } : {}),
          updated_at: now,
        })
        .eq("id", payload.id)
        .select("*")
        .single();

      if (error) throw new Error(error.message);

      logOnboarding("admin_dashboard_section_updated", { adminId: user.id, sectionId: payload.id });
      return jsonResponse({
        section: mapDashboardSectionRecord(data as PortalDashboardSectionRecord, []),
        message: "Dashboard tab updated.",
      });
    }

    let sortOrder = payload.sortOrder;
    if (sortOrder === undefined) {
      const { count, error: countError } = await adminClient
        .from("portal_dashboard_sections")
        .select("*", { count: "exact", head: true });
      if (countError) throw new Error(countError.message);
      sortOrder = count ?? 0;
    }

    const { data, error } = await adminClient
      .from("portal_dashboard_sections")
      .insert({
        id: payload.id,
        title: payload.title,
        published: payload.published,
        sort_order: sortOrder,
        section_type: payload.sectionType ?? "links",
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    logOnboarding("admin_dashboard_section_created", { adminId: user.id, sectionId: payload.id });
    return jsonResponse({
      section: mapDashboardSectionRecord(data as PortalDashboardSectionRecord, []),
      message: "Dashboard tab created.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to save dashboard tab";
    logOnboarding("admin_upsert_dashboard_section_failed", { error: message }, "error");
    return errorResponse(message, 500, "save_failed");
  }
});
