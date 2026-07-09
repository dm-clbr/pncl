import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  countAdmins,
  countDownlineAgents,
  loadOnboardingForPortalUser,
} from "../_shared/adminAgents.ts";
import { AdminAuthError, getUserRole, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { getEmailDomain, isValidReferrerUserId } from "../_shared/onboarding.ts";

interface DeleteUserPayload {
  userId: string;
}

function validatePayload(body: unknown): DeleteUserPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const userId = typeof (body as Record<string, unknown>).userId === "string"
    ? (body as Record<string, string>).userId.trim()
    : "";

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
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const payload = validatePayload(await req.json());
    const emailDomain = getEmailDomain();

    if (payload.userId === adminUser.id) {
      return errorResponse("You cannot delete your own account.", 409, "self_delete");
    }

    const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(
      payload.userId,
    );
    if (targetError || !targetData.user?.email) {
      return errorResponse("User not found", 404, "not_found");
    }

    const targetUser = targetData.user;
    const email = targetUser.email.toLowerCase();

    if (!email.endsWith(`@${emailDomain}`)) {
      return errorResponse(`Only @${emailDomain} portal accounts can be managed here.`, 400, "invalid_domain");
    }

    const targetRole = getUserRole(targetUser);
    if (targetRole === "admin") {
      const adminCount = await countAdmins(adminClient);
      if (adminCount <= 1) {
        return errorResponse("Cannot delete the last admin.", 409, "last_admin");
      }
    }

    const downlineCount = await countDownlineAgents(adminClient, payload.userId);
    if (downlineCount > 0) {
      return errorResponse(
        `This user is listed as upline for ${downlineCount} agent${downlineCount === 1 ? "" : "s"}. Reassign those agents before deleting.`,
        409,
        "has_downline",
      );
    }

    const onboarding = await loadOnboardingForPortalUser(
      adminClient,
      payload.userId,
      email,
      targetUser.app_metadata?.onboarding_id,
    );
    if (onboarding) {
      const { error: onboardingError } = await adminClient
        .from("onboarding_records")
        .update({
          status: "failed",
          supabase_user_id: null,
        })
        .eq("id", onboarding.id);

      if (onboardingError) {
        logOnboarding("admin_delete_user_onboarding_failed", {
          userId: payload.userId,
          onboardingId: onboarding.id,
          error: onboardingError.message,
        }, "error");
        return errorResponse("Unable to update onboarding record before delete.", 500, "delete_failed");
      }
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(payload.userId);
    if (deleteError) {
      logOnboarding("admin_delete_user_failed", {
        userId: payload.userId,
        email,
        error: deleteError.message,
      }, "error");
      return errorResponse("Unable to delete portal user", 500, "delete_failed");
    }

    logOnboarding("admin_user_deleted", {
      adminId: adminUser.id,
      userId: payload.userId,
      email,
      onboardingId: onboarding?.id ?? null,
    });

    return jsonResponse({
      userId: payload.userId,
      email,
      message: "Portal user deleted.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to delete user";
    logOnboarding("admin_delete_user_request_failed", { error: message }, "error");
    return errorResponse(message, 500, "delete_failed");
  }
});
