import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient, resolveReferrer } from "../_shared/onboarding.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const url = new URL(req.url);
    const ref = url.searchParams.get("ref")?.trim() ?? "";

    if (!ref) {
      return errorResponse("Missing referral id", 400, "invalid_request");
    }

    const supabase = getServiceClient();
    const referrer = await resolveReferrer(supabase, ref);

    if (!referrer) {
      return errorResponse("Referrer not found", 404, "not_found");
    }

    return jsonResponse({ id: referrer.id, name: referrer.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load referrer";
    return errorResponse(message, 500);
  }
});
