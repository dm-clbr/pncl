import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/onboarding.ts";
import { loadOnboardingContent, resolveOnboardingDesignation } from "../_shared/onboardingContent.ts";
import { loadAgentDesignations } from "../_shared/portalAgentDesignations.ts";
import { validateAgentDesignation } from "../_shared/agentDesignation.ts";
import { uploadedSigningEnabled } from "../_shared/signingRollout.ts";
import { loadOnboardingContent as loadLegacyContent } from "../_shared/legacySigning/onboardingContent.ts";

serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);
  try {
    const params = new URL(req.url).searchParams;
    let client; let designation; let userId: string | undefined;
    if (params.has("previewDesignation")) {
      ({ adminClient: client } = await requireAdmin(req));
      designation = validateAgentDesignation(params.get("previewDesignation"));
    } else if (params.get("scope") === "portal") {
      const auth = await requirePortalUser(req); client = auth.adminClient;
      userId = auth.user.id;
      designation = (await loadAgentDesignations(client, [auth.user.id])).get(auth.user.id) ?? "loa";
    } else {
      client = getServiceClient();
      designation = await resolveOnboardingDesignation(client, params.get("ref"));
    }
    const signingEnabled = params.has("previewDesignation") || await uploadedSigningEnabled(client, userId);
    const content = signingEnabled ? await loadOnboardingContent(client, designation) : await loadLegacyContent(client, designation);
    return jsonResponse({ ...content, signingEnabled });
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    return errorResponse(error instanceof Error ? error.message : "Unable to load onboarding content.", 400);
  }
});
