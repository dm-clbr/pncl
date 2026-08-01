import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { getWorkspaceUser } from "../_shared/googleWorkspace.ts";
import { markPortalEnrollmentReady } from "../_shared/portalAuth.ts";
import { logOnboarding } from "../_shared/logger.ts";

function hasRealGoogleSignIn(value: string | null): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > Date.UTC(2000, 0, 1);
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const { data: enrollment, error } = await adminClient
      .from("onboarding_records")
      .select("id, workspace_email, enrollment_status, google_first_sign_in_at")
      .eq("supabase_user_id", user.id)
      .maybeSingle();
    if (error || !enrollment) return errorResponse("Enrollment not found", 404, "not_found");

    const workspaceUser = await getWorkspaceUser(enrollment.workspace_email);
    const lastSignIn = workspaceUser?.lastLoginTime ?? null;
    await adminClient.from("onboarding_records").update({ google_sign_in_checked_at: new Date().toISOString() }).eq("id", enrollment.id);
    if (!hasRealGoogleSignIn(lastSignIn)) {
      return errorResponse("Finish signing in to Gmail and changing your temporary password first.", 409, "google_signin_pending");
    }

    await adminClient.from("onboarding_records").update({
      google_first_sign_in_at: lastSignIn,
      enrollment_status: "ready",
      status: "ready",
      onboarding_completed_at: new Date().toISOString(),
      finalized_at: new Date().toISOString(),
    }).eq("id", enrollment.id);
    await markPortalEnrollmentReady(adminClient, user.id, enrollment.id);
    logOnboarding("google_signin_activation_completed", { onboardingId: enrollment.id, userId: user.id });
    return jsonResponse({ activated: true, googleFirstSignInAt: lastSignIn });
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    const message = error instanceof Error ? error.message : "Unable to verify Google sign-in";
    logOnboarding("google_signin_activation_failed", { error: message }, "error");
    return errorResponse(message, 500);
  }
});
