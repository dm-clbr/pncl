import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";
import { OnboardingHoldError, setOnboardingHoldReleased } from "../_shared/onboardingHolds.ts";

interface ReleaseHoldPayload {
  onboardingId: string;
  released: boolean;
}

function validatePayload(body: unknown): ReleaseHoldPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const record = body as Record<string, unknown>;
  const onboardingId = typeof record.onboardingId === "string" ? record.onboardingId.trim() : "";

  if (!isValidReferrerUserId(onboardingId)) {
    throw new Error("Valid onboarding id is required");
  }

  return {
    onboardingId,
    released: record.released !== false,
  };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const payload = validatePayload(await req.json());

    const hold = await setOnboardingHoldReleased(
      adminClient,
      payload.onboardingId,
      payload.released,
    );

    logOnboarding("admin_onboarding_hold_updated", {
      adminId: adminUser.id,
      onboardingId: hold.onboardingId,
      released: payload.released,
      phoneNumber: hold.phoneNumber,
      status: hold.status,
    });

    return jsonResponse({
      hold,
      message: payload.released
        ? `Released the hold on ${hold.phoneNumber}. ${hold.legalName} can submit a new application.`
        : `Restored the hold on ${hold.phoneNumber}.`,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    if (error instanceof OnboardingHoldError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update onboarding hold";
    logOnboarding("admin_onboarding_hold_update_failed", { error: message }, "error");
    return errorResponse(message, 500, "update_failed");
  }
});
