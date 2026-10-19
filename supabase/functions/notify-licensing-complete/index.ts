import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";

// Older clients may still call this after a profile save. Contracting now starts
// only when the agent explicitly submits for New Producer.
serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    await requirePortalUser(req);
    return jsonResponse({ notified: false, reason: "replaced_by_new_producer_submission" });
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    return errorResponse("Unable to authenticate request", 500);
  }
});
