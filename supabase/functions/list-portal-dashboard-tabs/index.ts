import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { loadDashboardTabs } from "../_shared/portalDashboardTabs.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requirePortalUser(req);
    const sections = await loadDashboardTabs(adminClient, true);
    return jsonResponse({
      sections: sections
        .filter((section) => {
          if (section.sectionType === "links") return section.links.length > 0;
          if (section.sectionType === "downloads") return section.files.length > 0;
          return section.published;
        })
        .map((section) => ({
          id: section.id,
          title: section.title,
          sectionType: section.sectionType,
          sortOrder: section.sortOrder,
          links: section.sectionType === "links"
            ? section.links
              .filter((link) => link.published)
              .map((link) => ({
                id: link.id,
                title: link.title,
                description: link.description,
                href: link.href,
                external: link.external,
                icon: link.icon,
              }))
            : [],
          files: section.sectionType === "downloads"
            ? section.files
              .filter((file) => file.published)
              .map((file) => ({
                id: file.id,
                title: file.title,
                description: file.description,
                url: file.url,
                fileName: file.fileName,
                contentType: file.contentType,
              }))
            : [],
        })),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list dashboard tabs";
    logOnboarding("list_portal_dashboard_tabs_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
