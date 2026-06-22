import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";

interface MarkGenesisPayload {
  userId: string;
}

function validateMarkGenesisPayload(body: unknown): MarkGenesisPayload {
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
    const payload = validateMarkGenesisPayload(await req.json());

    const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(payload.userId);
    if (targetError || !targetData.user) {
      return errorResponse("User not found", 404, "not_found");
    }

    const existingCreatedAt = targetData.user.user_metadata?.genesis_account_created_at;
    if (typeof existingCreatedAt === "string" && existingCreatedAt.trim()) {
      return jsonResponse({
        userId: payload.userId,
        genesisAccountCreatedAt: existingCreatedAt,
        message: "Genesis account was already marked as created.",
      });
    }

    const createdAt = new Date().toISOString();
    const userMetadata = {
      ...targetData.user.user_metadata,
      genesis_account_created_at: createdAt,
      genesis_account_notice_dismissed: false,
    };

    const { error: updateError } = await adminClient.auth.admin.updateUserById(payload.userId, {
      user_metadata: userMetadata,
    });

    if (updateError) {
      logOnboarding("admin_mark_genesis_failed", {
        userId: payload.userId,
        error: updateError.message,
      }, "error");
      return errorResponse("Unable to mark Genesis account as created", 500, "update_failed");
    }

    logOnboarding("admin_genesis_account_marked", {
      adminId: adminUser.id,
      userId: payload.userId,
      createdAt,
    });

    return jsonResponse({
      userId: payload.userId,
      genesisAccountCreatedAt: createdAt,
      message: "Genesis account marked as created. The agent will see a notice on their dashboard.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to mark Genesis account";
    logOnboarding("admin_mark_genesis_request_failed", { error: message }, "error");
    return errorResponse(message, 500, "update_failed");
  }
});
