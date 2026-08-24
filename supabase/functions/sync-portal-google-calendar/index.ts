import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  getGoogleCalendarOAuthConfig,
  GoogleCalendarAuthorizationError,
  markGoogleCalendarAuthorizationExpired,
  refreshGoogleCalendarAccessToken,
  replaceGoogleCalendarPreview,
} from "../_shared/portalGoogleCalendar.ts";
import { decryptSecret, encryptSecret } from "../_shared/security.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const { data: credential, error: credentialError } = await adminClient
      .from("portal_google_calendar_credentials")
      .select("refresh_token_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();
    if (credentialError) throw new Error(credentialError.message);
    if (!credential?.refresh_token_encrypted) {
      return errorResponse("Connect Google Calendar first", 404, "not_connected");
    }

    try {
      const refreshToken = await decryptSecret(credential.refresh_token_encrypted);
      const token = await refreshGoogleCalendarAccessToken({
        refreshToken,
        config: getGoogleCalendarOAuthConfig(),
      });
      if (token.refreshToken) {
        const encrypted = await encryptSecret(token.refreshToken);
        const { error } = await adminClient
          .from("portal_google_calendar_credentials")
          .update({ refresh_token_encrypted: encrypted })
          .eq("user_id", user.id);
        if (error) throw new Error(error.message);
      }

      const result = await replaceGoogleCalendarPreview(adminClient, user.id, token.accessToken);
      logOnboarding("portal_google_calendar_synced", {
        userId: user.id,
        eventCount: result.eventCount,
      });
      return jsonResponse({ synced: true, ...result });
    } catch (error) {
      if (error instanceof GoogleCalendarAuthorizationError) {
        await markGoogleCalendarAuthorizationExpired(adminClient, user.id);
        return errorResponse(
          "Google Calendar authorization expired. Reconnect to continue.",
          409,
          "reauthorization_required",
        );
      }
      await adminClient
        .from("portal_google_calendar_connections")
        .update({ last_error_code: "sync_failed" })
        .eq("user_id", user.id);
      throw error;
    }
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to refresh Google Calendar";
    logOnboarding("portal_google_calendar_sync_failed", { error: message }, "error");
    return errorResponse("Unable to refresh Google Calendar", 502, "sync_failed");
  }
});
