import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { loadOnboardingContent } from "../_shared/onboardingContent.ts";

serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== "GET" && req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { adminClient } = await requireAdmin(req);
    if (req.method === "GET") return jsonResponse({ flows: await Promise.all([loadOnboardingContent(adminClient, "loa"), loadOnboardingContent(adminClient, "ibo")]) });
    return errorResponse("Manage signing documents and videos in Onboarding Steps.", 409);
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    return errorResponse(error instanceof Error ? error.message : "Unable to save onboarding content.", 400);
  }
});
