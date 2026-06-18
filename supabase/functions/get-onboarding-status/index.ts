import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  buildGmailUrl,
  getServiceClient,
  isTokenExpired,
  type OnboardingRecord,
} from "../_shared/onboarding.ts";
import { validateHandoffToken } from "../_shared/security.ts";

const TERMINAL_STATUSES = new Set([
  "ready",
  "failed",
  "expired",
  "credentials_viewed",
]);

function buildStatusResponse(record: OnboardingRecord) {
  const credentialsViewed = !!record.credentials_viewed_at;
  const email = record.workspace_email ?? undefined;
  const gmailUrl = email ? buildGmailUrl(email) : undefined;

  if (record.status === "failed") {
    return {
      status: "failed",
      message: "We couldn’t finish creating your PNCL email.",
    };
  }

  if (record.status === "expired") {
    return {
      status: "expired",
      message: "This sign-in link has expired.",
    };
  }

  if (credentialsViewed || record.status === "credentials_viewed") {
    return {
      status: "credentials_viewed",
      email,
      credentialsViewed: true,
      gmailUrl,
      message: "Temporary sign-in details have already been viewed.",
    };
  }

  if (record.status === "ready" || record.status === "email_created") {
    return {
      status: "ready",
      email,
      credentialsViewed: false,
      gmailUrl,
      message: "Your PNCL email is ready.",
    };
  }

  return {
    status: record.status,
    message: "Your PNCL email is being created.",
  };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const token = url.searchParams.get("token");

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

    if (isTokenExpired(record.handoff_token_expires_at)) {
      if (record.status !== "credentials_viewed" && record.status !== "expired") {
        await supabase
          .from("onboarding_records")
          .update({ status: "expired", temporary_password_encrypted: null })
          .eq("id", record.id);
      }

      return jsonResponse({
        status: "expired",
        message: "This sign-in link has expired.",
      });
    }

    return jsonResponse(buildStatusResponse(record as OnboardingRecord));
  } catch (error) {
    console.error("get-onboarding-status failed", error);
    return errorResponse("Unable to fetch onboarding status", 500);
  }
});

export { TERMINAL_STATUSES };
