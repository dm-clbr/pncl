import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import {
  mapDashboardLinkRecord,
  type PortalDashboardLinkRecord,
  validateUpsertDashboardLinkPayload,
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
    const payload = validateUpsertDashboardLinkPayload(await req.json());
    const now = new Date().toISOString();

    if (payload.id) {
      const { data, error } = await adminClient
        .from("portal_dashboard_links")
        .update({
          section_id: payload.sectionId,
          title: payload.title,
          description: payload.description,
          href: payload.href,
          external: payload.external,
          icon: payload.icon,
          published: payload.published,
          ...(payload.sortOrder !== undefined ? { sort_order: payload.sortOrder } : {}),
          updated_at: now,
        })
        .eq("id", payload.id)
        .select("*")
        .single();

      if (error) throw new Error(error.message);

      logOnboarding("admin_dashboard_link_updated", { adminId: user.id, linkId: payload.id });
      return jsonResponse({
        link: mapDashboardLinkRecord(data as PortalDashboardLinkRecord),
        message: "Dashboard link updated.",
      });
    }

    let sortOrder = payload.sortOrder;
    if (sortOrder === undefined) {
      const { count, error: countError } = await adminClient
        .from("portal_dashboard_links")
        .select("*", { count: "exact", head: true })
        .eq("section_id", payload.sectionId);
      if (countError) throw new Error(countError.message);
      sortOrder = count ?? 0;
    }

    const { data, error } = await adminClient
      .from("portal_dashboard_links")
      .insert({
        section_id: payload.sectionId,
        title: payload.title,
        description: payload.description,
        href: payload.href,
        external: payload.external,
        icon: payload.icon,
        published: payload.published,
        sort_order: sortOrder,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    logOnboarding("admin_dashboard_link_created", { adminId: user.id, linkId: data.id });
    return jsonResponse({
      link: mapDashboardLinkRecord(data as PortalDashboardLinkRecord),
      message: "Dashboard link created.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to save dashboard link";
    logOnboarding("admin_upsert_dashboard_link_failed", { error: message }, "error");
    return errorResponse(message, 500, "save_failed");
  }
});
