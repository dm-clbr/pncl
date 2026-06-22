import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

type LinkPlacement = {
  sectionId: string;
  linkIds: string[];
};

function validateLinkPlacements(value: unknown): LinkPlacement[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const sectionId = typeof item.sectionId === "string" ? item.sectionId.trim() : "";
      const linkIds = Array.isArray(item.linkIds)
        ? item.linkIds.filter((id): id is string => typeof id === "string" && !!id.trim())
        : [];
      return { sectionId, linkIds };
    })
    .filter((placement) => placement.sectionId);
}

function validateReorderPayload(body: unknown): {
  sectionIds?: string[];
  sectionId?: string;
  linkIds?: string[];
  linkPlacements?: LinkPlacement[];
} {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const linkPlacements = validateLinkPlacements(data.linkPlacements);
  const sectionIds = Array.isArray(data.sectionIds)
    ? data.sectionIds.filter((id): id is string => typeof id === "string" && !!id.trim())
    : undefined;
  const linkIds = Array.isArray(data.linkIds)
    ? data.linkIds.filter((id): id is string => typeof id === "string" && !!id.trim())
    : undefined;
  const sectionId = typeof data.sectionId === "string" && data.sectionId.trim()
    ? data.sectionId.trim()
    : undefined;

  if (linkPlacements?.length) {
    return { linkPlacements };
  }

  if (sectionIds?.length) {
    return { sectionIds };
  }

  if (sectionId && linkIds?.length) {
    return { sectionId, linkIds };
  }

  throw new Error("Provide linkPlacements, sectionIds, or sectionId with linkIds");
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const payload = validateReorderPayload(await req.json());
    const now = new Date().toISOString();

    if (payload.linkPlacements) {
      for (const placement of payload.linkPlacements) {
        for (let index = 0; index < placement.linkIds.length; index += 1) {
          const { error } = await adminClient
            .from("portal_dashboard_links")
            .update({
              section_id: placement.sectionId,
              sort_order: index,
              updated_at: now,
            })
            .eq("id", placement.linkIds[index]);

          if (error) throw new Error(error.message);
        }
      }

      logOnboarding("admin_dashboard_links_placed", {
        adminId: user.id,
        sectionCount: payload.linkPlacements.length,
      });
      return jsonResponse({ message: "Dashboard links updated." });
    }

    if (payload.sectionIds) {
      for (let index = 0; index < payload.sectionIds.length; index += 1) {
        const { error } = await adminClient
          .from("portal_dashboard_sections")
          .update({ sort_order: index, updated_at: now })
          .eq("id", payload.sectionIds[index]);

        if (error) throw new Error(error.message);
      }

      logOnboarding("admin_dashboard_sections_reordered", {
        adminId: user.id,
        count: payload.sectionIds.length,
      });
      return jsonResponse({ message: "Dashboard tab order updated." });
    }

    for (let index = 0; index < payload.linkIds!.length; index += 1) {
      const { error } = await adminClient
        .from("portal_dashboard_links")
        .update({ sort_order: index, updated_at: now })
        .eq("id", payload.linkIds![index])
        .eq("section_id", payload.sectionId!);

      if (error) throw new Error(error.message);
    }

    logOnboarding("admin_dashboard_links_reordered", {
      adminId: user.id,
      sectionId: payload.sectionId,
      count: payload.linkIds!.length,
    });
    return jsonResponse({ message: "Dashboard link order updated." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to reorder dashboard tabs";
    logOnboarding("admin_reorder_dashboard_tabs_failed", { error: message }, "error");
    return errorResponse(message, 500, "reorder_failed");
  }
});
