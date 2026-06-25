import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { getServiceClient } from "../_shared/onboarding.ts";
import { resendPortalInvite } from "../_shared/portalAuth.ts";
import { validateHandoffToken } from "../_shared/security.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    const token = typeof body?.token === "string" ? body.token : "";

    if (!id || !token) {
      return errorResponse("Missing onboarding id or token", 400, "invalid_request");
    }

    const supabase = getServiceClient();
    const { data: record, error } = await supabase
      .from("onboarding_records")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !record) {
      return errorResponse("Onboarding record not found", 404, "not_found");
    }

    const tokenValid = await validateHandoffToken(token, record.handoff_token_hash);
    if (!tokenValid) {
      return errorResponse("Invalid sign-in handoff token.", 403, "invalid_token");
    }

    if (!record.workspace_email) {
      return errorResponse("PNCL email is not ready yet.", 409, "email_not_ready");
    }

    const supabaseUserId = await resendPortalInvite(supabase, {
      email: record.workspace_email,
      legalName: record.legal_name,
      firstName: record.first_name,
      lastName: record.last_name,
      onboardingId: record.id,
      existingSupabaseUserId: record.supabase_user_id,
    });

    await supabase
      .from("onboarding_records")
      .update({ supabase_user_id: supabaseUserId })
      .eq("id", record.id);

    logOnboarding("portal_invite_resent", {
      onboardingId: id,
      email: record.workspace_email,
      supabaseUserId,
    });

    return jsonResponse({
      email: record.workspace_email,
      message: "Portal welcome email sent. Sign in with Google at the portal login page.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resend portal activation email";
    logOnboarding("portal_invite_resend_failed", { error: message }, "error");
    return errorResponse(message, 500, "portal_invite_failed");
  }
});
