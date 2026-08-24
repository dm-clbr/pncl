import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { revokeGoogleCalendarToken } from "../_shared/portalGoogleCalendar.ts";
import { decryptSecret } from "../_shared/security.ts";

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

    let revoked = true;
    if (credential?.refresh_token_encrypted) {
      const refreshToken = await decryptSecret(credential.refresh_token_encrypted);
      revoked = await revokeGoogleCalendarToken(refreshToken);
    }

    const results = await Promise.all([
      adminClient.from("portal_google_calendar_oauth_attempts").delete().eq("user_id", user.id),
      adminClient.from("portal_google_calendar_events").delete().eq("user_id", user.id),
      adminClient.from("portal_google_calendar_credentials").delete().eq("user_id", user.id),
      adminClient.from("portal_google_calendar_connections").delete().eq("user_id", user.id),
    ]);
    const cleanupError = results.find((result) => result.error)?.error;
    if (cleanupError) throw new Error(cleanupError.message);

    logOnboarding("portal_google_calendar_disconnected", { userId: user.id, revoked });
    return jsonResponse({
      disconnected: true,
      revoked,
      message: revoked
        ? "Google Calendar disconnected and authorization revoked."
        : "Calendar data was deleted, but Google did not confirm revocation.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to disconnect Google Calendar";
    logOnboarding("portal_google_calendar_disconnect_failed", { error: message }, "error");
    return errorResponse("Unable to disconnect Google Calendar", 500, "disconnect_failed");
  }
});
