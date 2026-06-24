import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { isValidCompLevel } from "../_shared/compLevel.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { updateAgentCompLevel } from "../_shared/portalReferralInvites.ts";

interface UpdateCompLevelPayload {
  userId?: unknown;
  compLevel?: unknown;
}

function validatePayload(body: unknown): { userId: string; compLevel: number | null } {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as UpdateCompLevelPayload;
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!userId) {
    throw new Error("User id is required.");
  }

  if (data.compLevel == null || data.compLevel === "") {
    return { userId, compLevel: null };
  }

  const compLevel = typeof data.compLevel === "number"
    ? data.compLevel
    : typeof data.compLevel === "string"
    ? Number.parseInt(data.compLevel, 10)
    : Number.NaN;

  if (!isValidCompLevel(compLevel)) {
    throw new Error("Select a valid comp level.");
  }

  return { userId, compLevel };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireGenesisAdminOrAdmin(req);
    const payload = validatePayload(await req.json());

    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(payload.userId);
    if (userError || !userData.user) {
      return errorResponse("User not found", 404, "not_found");
    }

    await updateAgentCompLevel(adminClient, payload.userId, payload.compLevel);

    return jsonResponse({
      userId: payload.userId,
      compLevel: payload.compLevel,
      message: payload.compLevel == null
        ? "Comp level cleared."
        : `Comp level set to ${payload.compLevel}.`,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update comp level";
    return errorResponse(message, 400);
  }
});
