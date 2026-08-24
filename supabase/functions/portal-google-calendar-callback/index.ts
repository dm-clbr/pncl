import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildPortalCalendarReturnUrl,
  GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
  sha256Hex,
  type CalendarCallbackReason,
} from "../_shared/googleCalendar.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  exchangeGoogleAuthorizationCode,
  getGoogleCalendarOAuthConfig,
  GoogleCalendarAuthorizationError,
  replaceGoogleCalendarPreview,
} from "../_shared/portalGoogleCalendar.ts";
import { decryptSecret, encryptSecret } from "../_shared/security.ts";

interface OAuthAttemptRecord {
  user_id: string;
  code_verifier_encrypted: string;
  expires_at: string;
}

function redirectToPortal(
  siteUrl: string,
  result: "connected" | "canceled" | "error",
  reason?: CalendarCallbackReason,
): Response {
  return Response.redirect(buildPortalCalendarReturnUrl(siteUrl, result, reason), 303);
}

serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  let config;
  try {
    config = getGoogleCalendarOAuthConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Missing Google Calendar configuration";
    logOnboarding("portal_google_calendar_callback_config_failed", { error: message }, "error");
    return new Response("Google Calendar integration is not configured", { status: 503 });
  }

  const requestUrl = new URL(req.url);
  const state = requestUrl.searchParams.get("state");
  if (!state) return redirectToPortal(config.siteUrl, "error", "invalid_state");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Server configuration error", { status: 500 });
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stateHash = await sha256Hex(state);
  const { data, error: consumeError } = await adminClient
    .from("portal_google_calendar_oauth_attempts")
    .delete()
    .eq("state_hash", stateHash)
    .select("user_id,code_verifier_encrypted,expires_at")
    .maybeSingle();

  if (consumeError || !data) {
    return redirectToPortal(config.siteUrl, "error", "invalid_state");
  }

  const attempt = data as OAuthAttemptRecord;
  if (new Date(attempt.expires_at).getTime() <= Date.now()) {
    return redirectToPortal(config.siteUrl, "error", "expired_state");
  }

  const providerError = requestUrl.searchParams.get("error");
  if (providerError) {
    logOnboarding("portal_google_calendar_oauth_canceled", { userId: attempt.user_id });
    return redirectToPortal(config.siteUrl, "canceled");
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) return redirectToPortal(config.siteUrl, "error", "missing_code");

  let calendarStorageChanged = false;
  try {
    const codeVerifier = await decryptSecret(attempt.code_verifier_encrypted);
    const token = await exchangeGoogleAuthorizationCode({ code, codeVerifier, config });

    const [
      { data: existingCredential, error: credentialReadError },
      { data: existingConnection, error: connectionReadError },
    ] = await Promise.all([
      adminClient
        .from("portal_google_calendar_credentials")
        .select("refresh_token_encrypted")
        .eq("user_id", attempt.user_id)
        .maybeSingle(),
      adminClient
        .from("portal_google_calendar_connections")
        .select("status")
        .eq("user_id", attempt.user_id)
        .maybeSingle(),
    ]);
    if (credentialReadError) throw new Error(credentialReadError.message);
    if (connectionReadError) throw new Error(connectionReadError.message);

    const refreshTokenEncrypted = token.refreshToken
      ? await encryptSecret(token.refreshToken)
      : existingConnection?.status === "connected"
        ? existingCredential?.refresh_token_encrypted
        : null;
    if (!refreshTokenEncrypted) {
      throw new Error("Google did not return offline access");
    }

    const connectedAt = new Date().toISOString();
    const { error: credentialError } = await adminClient
      .from("portal_google_calendar_credentials")
      .upsert({
        user_id: attempt.user_id,
        refresh_token_encrypted: refreshTokenEncrypted,
      }, { onConflict: "user_id" });
    if (credentialError) throw new Error(credentialError.message);
    calendarStorageChanged = true;

    const { error: connectionError } = await adminClient
      .from("portal_google_calendar_connections")
      .upsert({
        user_id: attempt.user_id,
        status: "connected",
        scope: GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
        connected_at: connectedAt,
        last_error_code: null,
      }, { onConflict: "user_id" });
    if (connectionError) throw new Error(connectionError.message);

    try {
      await replaceGoogleCalendarPreview(adminClient, attempt.user_id, token.accessToken);
    } catch (syncError) {
      if (syncError instanceof GoogleCalendarAuthorizationError) throw syncError;
      await adminClient
        .from("portal_google_calendar_connections")
        .update({ last_error_code: "sync_failed" })
        .eq("user_id", attempt.user_id);
      logOnboarding("portal_google_calendar_initial_sync_failed", {
        userId: attempt.user_id,
        error: syncError instanceof Error ? syncError.message : "sync_failed",
      }, "warn");
      return redirectToPortal(config.siteUrl, "connected", "sync_failed");
    }

    logOnboarding("portal_google_calendar_connected", { userId: attempt.user_id });
    return redirectToPortal(config.siteUrl, "connected");
  } catch (error) {
    const permissionError = error instanceof GoogleCalendarAuthorizationError;
    if (calendarStorageChanged) {
      const cleanupResults = await Promise.all([
        adminClient.from("portal_google_calendar_events").delete().eq("user_id", attempt.user_id),
        adminClient.from("portal_google_calendar_credentials").delete().eq("user_id", attempt.user_id),
        adminClient.from("portal_google_calendar_connections").delete().eq("user_id", attempt.user_id),
      ]);
      if (cleanupResults.some((result) => result.error)) {
        logOnboarding("portal_google_calendar_oauth_cleanup_failed", {
          userId: attempt.user_id,
        }, "error");
      }
    }
    logOnboarding("portal_google_calendar_oauth_failed", {
      userId: attempt.user_id,
      category: permissionError ? "permission_missing" : "token_exchange_failed",
    }, "error");
    return redirectToPortal(
      config.siteUrl,
      "error",
      permissionError ? "permission_missing" : "token_exchange_failed",
    );
  }
});
