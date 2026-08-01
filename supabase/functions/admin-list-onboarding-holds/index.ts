import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { listOnboardingHolds } from "../_shared/onboardingHolds.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const search = new URL(req.url).searchParams.get("search") ?? undefined;
    const holds = await listOnboardingHolds(adminClient, search);

    logOnboarding("admin_list_onboarding_holds", {
      adminId: adminUser.id,
      hasSearch: Boolean(search?.trim()),
      count: holds.length,
    });

    return jsonResponse({ holds });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list onboarding holds";
    logOnboarding("admin_list_onboarding_holds_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
