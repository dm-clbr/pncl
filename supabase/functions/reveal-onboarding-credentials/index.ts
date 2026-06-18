import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  buildGmailUrl,
  getServiceClient,
  isTokenExpired,
  type OnboardingRecord,
} from "../_shared/onboarding.ts";
import {
  decryptTemporaryPassword,
  validateHandoffToken,
} from "../_shared/security.ts";

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

    const onboarding = record as OnboardingRecord;
    const tokenValid = await validateHandoffToken(token, onboarding.handoff_token_hash);
    if (!tokenValid) {
      return errorResponse("Invalid sign-in handoff token.", 403, "invalid_token");
    }

    if (isTokenExpired(onboarding.handoff_token_expires_at)) {
      await supabase
        .from("onboarding_records")
        .update({ status: "expired", temporary_password_encrypted: null })
        .eq("id", onboarding.id);

      return errorResponse("This sign-in link has expired.", 403, "handoff_token_expired");
    }

    if (onboarding.credentials_viewed_at || onboarding.status === "credentials_viewed") {
      return errorResponse(
        "Temporary sign-in details have already been viewed.",
        409,
        "credentials_already_viewed",
      );
    }

    if (onboarding.status !== "ready" && onboarding.status !== "email_created") {
      return errorResponse("Credentials are not ready yet.", 409, "credentials_not_ready");
    }

    if (!onboarding.workspace_email || !onboarding.temporary_password_encrypted) {
      return errorResponse("Temporary credentials are unavailable.", 409, "credentials_unavailable");
    }

    const temporaryPassword = await decryptTemporaryPassword(
      onboarding.temporary_password_encrypted,
    );

    const viewedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("onboarding_records")
      .update({
        credentials_viewed_at: viewedAt,
        temporary_password_encrypted: null,
        status: "credentials_viewed",
      })
      .eq("id", onboarding.id)
      .is("credentials_viewed_at", null);

    if (updateError) {
      console.error("Failed to mark credentials as viewed", updateError);
      return errorResponse("Unable to reveal credentials", 500);
    }

    return jsonResponse({
      email: onboarding.workspace_email,
      temporaryPassword,
      mustChangePassword: true,
      gmailUrl: buildGmailUrl(onboarding.workspace_email),
    });
  } catch (error) {
    console.error("reveal-onboarding-credentials failed", error);
    return errorResponse("Unable to reveal credentials", 500);
  }
});
