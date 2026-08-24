import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  buildGoogleAuthorizationUrl,
  createPkceChallenge,
  generateOAuthState,
  generatePkceVerifier,
  sha256Hex,
} from "../_shared/googleCalendar.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { getGoogleCalendarOAuthConfig } from "../_shared/portalGoogleCalendar.ts";
import { encryptSecret } from "../_shared/security.ts";

const OAUTH_ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const config = getGoogleCalendarOAuthConfig();
    const state = generateOAuthState();
    const codeVerifier = generatePkceVerifier();
    const [stateHash, codeChallenge, codeVerifierEncrypted] = await Promise.all([
      sha256Hex(state),
      createPkceChallenge(codeVerifier),
      encryptSecret(codeVerifier),
    ]);
    const expiresAt = new Date(Date.now() + OAUTH_ATTEMPT_LIFETIME_MS).toISOString();

    const cleanupResults = await Promise.all([
      adminClient
        .from("portal_google_calendar_oauth_attempts")
        .delete()
        .lt("expires_at", new Date().toISOString()),
      adminClient
        .from("portal_google_calendar_oauth_attempts")
        .delete()
        .eq("user_id", user.id),
    ]);
    const cleanupError = cleanupResults.find((result) => result.error)?.error;
    if (cleanupError) throw new Error(cleanupError.message);

    const { error } = await adminClient
      .from("portal_google_calendar_oauth_attempts")
      .insert({
        state_hash: stateHash,
        user_id: user.id,
        code_verifier_encrypted: codeVerifierEncrypted,
        expires_at: expiresAt,
      });
    if (error) throw new Error(error.message);

    const authorizationUrl = buildGoogleAuthorizationUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      codeChallenge,
    });

    logOnboarding("portal_google_calendar_oauth_started", { userId: user.id });
    return jsonResponse({ authorizationUrl, expiresAt });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to start Google Calendar connection";
    logOnboarding("portal_google_calendar_oauth_start_failed", { error: message }, "error");
    return errorResponse("Unable to start Google Calendar connection", 500, "start_failed");
  }
});
