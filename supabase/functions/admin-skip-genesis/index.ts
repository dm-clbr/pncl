import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";

interface SkipGenesisPayload {
  userId: string;
}

function validateSkipGenesisPayload(body: unknown): SkipGenesisPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!isValidReferrerUserId(userId)) {
    throw new Error("Valid user id is required");
  }

  return { userId };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireGenesisAdminOrAdmin(req);
    const payload = validateSkipGenesisPayload(await req.json());

    const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(payload.userId);
    if (targetError || !targetData.user) {
      return errorResponse("User not found", 404, "not_found");
    }

    const existingCreatedAt = targetData.user.user_metadata?.genesis_account_created_at;
    if (typeof existingCreatedAt === "string" && existingCreatedAt.trim()) {
      return errorResponse("This user already has a Genesis account marked as created.", 409, "already_created");
    }

    const existingSkippedAt = targetData.user.user_metadata?.genesis_account_skipped_at;
    if (typeof existingSkippedAt === "string" && existingSkippedAt.trim()) {
      return jsonResponse({
        userId: payload.userId,
        genesisAccountSkippedAt: existingSkippedAt,
        message: "Genesis account was already marked as skipped.",
      });
    }

    const skippedAt = new Date().toISOString();
    const userMetadata = {
      ...targetData.user.user_metadata,
      genesis_account_skipped_at: skippedAt,
    };

    const { error: updateError } = await adminClient.auth.admin.updateUserById(payload.userId, {
      user_metadata: userMetadata,
    });

    if (updateError) {
      logOnboarding("admin_skip_genesis_failed", {
        userId: payload.userId,
        error: updateError.message,
      }, "error");
      return errorResponse("Unable to skip Genesis account", 500, "update_failed");
    }

    logOnboarding("admin_genesis_account_skipped", {
      adminId: adminUser.id,
      userId: payload.userId,
      skippedAt,
    });

    return jsonResponse({
      userId: payload.userId,
      genesisAccountSkippedAt: skippedAt,
      message: `${targetData.user.email ?? "User"} marked as not needing a Genesis account.`,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to skip Genesis account";
    logOnboarding("admin_skip_genesis_request_failed", { error: message }, "error");
    return errorResponse(message, 500, "update_failed");
  }
});
