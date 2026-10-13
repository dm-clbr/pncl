import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { savePortalTodoAudiences, validatePortalTodoAudiences } from "../_shared/portalTodoAudiences.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { user, adminClient } = await requireAdmin(req);
    let steps;
    try {
      steps = validatePortalTodoAudiences(await req.json());
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "Invalid request", 400, "invalid_request");
    }
    await savePortalTodoAudiences(adminClient, steps);
    logOnboarding("admin_onboarding_steps_saved", { adminId: user.id, steps });
    return jsonResponse({ message: "LOA and IBO onboarding steps saved." });
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    const message = error instanceof Error ? error.message : "Unable to save onboarding steps";
    return errorResponse(message, 500, "save_failed");
  }
});
