import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { requireAdmin, AdminAuthError } from "../_shared/adminAuth.ts";
import { handleCors, errorResponse } from "../_shared/cors.ts";
serve(async req => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    await requireAdmin(req);
    return errorResponse("Upload compensation templates in Onboarding Steps. For private agent-specific agreements, use its Document requests tool.", 409, "use_onboarding_steps");
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    return errorResponse("Unable to verify admin access.", 403);
  }
});
