import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  findPortalUserIdByEmail,
  loadOnboardingForPortalUser,
} from "../_shared/adminAgents.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { getEmailDomain, isValidReferrerUserId } from "../_shared/onboarding.ts";

interface UpdateUserEmailPayload {
  userId: string;
  email: string;
}

function validatePayload(body: unknown): UpdateUserEmailPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!isValidReferrerUserId(userId)) {
    throw new Error("Valid user id is required");
  }

  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  if (!email) throw new Error("Email is required");

  const emailDomain = getEmailDomain();
  if (!email.endsWith(`@${emailDomain}`)) {
    throw new Error(`Email must use @${emailDomain}`);
  }

  return { userId, email };
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

    const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(
      payload.userId,
    );
    if (targetError || !targetData.user?.email) {
      return errorResponse("User not found", 404, "not_found");
    }

    const currentEmail = targetData.user.email.toLowerCase();
    if (!currentEmail.endsWith(`@${emailDomain}`)) {
      return errorResponse(`Only @${emailDomain} portal accounts can be managed here.`, 400, "invalid_domain");
    }

    if (payload.email === currentEmail) {
      return jsonResponse({
        userId: payload.userId,
        email: payload.email,
        message: "Email is already up to date.",
      });
    }

    const existingUserId = await findPortalUserIdByEmail(adminClient, payload.email);
    if (existingUserId && existingUserId !== payload.userId) {
      return errorResponse("That email is already assigned to another portal user.", 409, "email_taken");
    }

    const { data: conflictingOnboarding } = await adminClient
      .from("onboarding_records")
      .select("id, supabase_user_id")
      .eq("workspace_email", payload.email)
      .maybeSingle();

    if (
      conflictingOnboarding
      && conflictingOnboarding.supabase_user_id
      && conflictingOnboarding.supabase_user_id !== payload.userId
    ) {
      return errorResponse("That email is already assigned to another onboarding record.", 409, "email_taken");
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(payload.userId, {
      email: payload.email,
      email_confirm: true,
    });

    if (updateError) {
      logOnboarding("admin_update_user_email_failed", {
        userId: payload.userId,
        previousEmail: currentEmail,
        nextEmail: payload.email,
        error: updateError.message,
      }, "error");
      return errorResponse("Unable to update portal email", 500, "update_failed");
    }

    const onboarding = await loadOnboardingForPortalUser(
      adminClient,
      payload.userId,
      currentEmail,
      targetData.user.app_metadata?.onboarding_id,
    );
    if (onboarding) {
      const { error: onboardingError } = await adminClient
        .from("onboarding_records")
        .update({
          workspace_email: payload.email,
          supabase_user_id: payload.userId,
        })
        .eq("id", onboarding.id);

      if (onboardingError) {
        logOnboarding("admin_update_user_email_onboarding_failed", {
          userId: payload.userId,
          onboardingId: onboarding.id,
          error: onboardingError.message,
        }, "error");
        return errorResponse("Portal email updated, but onboarding record could not be synced.", 500, "onboarding_sync_failed");
      }
    }

    logOnboarding("admin_user_email_updated", {
      adminId: adminUser.id,
      userId: payload.userId,
      previousEmail: currentEmail,
      nextEmail: payload.email,
      onboardingId: onboarding?.id ?? null,
    });

    return jsonResponse({
      userId: payload.userId,
      email: payload.email,
      message: "Portal email updated.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update email";
    logOnboarding("admin_update_user_email_request_failed", { error: message }, "error");
    return errorResponse(message, 500, "update_failed");
  }
});
