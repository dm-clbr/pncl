import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { getServiceClient } from "../_shared/onboarding.ts";
import { sendPortalConfirmationEmail } from "../_shared/portalAuth.ts";

const ALLOWED_EMAIL_DOMAIN = "thepncl.com";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing authorization", 401, "unauthorized");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse("Server configuration error", 500, "config_error");
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.email) {
      return errorResponse("Unauthorized", 401, "unauthorized");
    }

    const email = user.email.toLowerCase();
    if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      return errorResponse(
        `Only @${ALLOWED_EMAIL_DOMAIN} accounts can access the employee portal.`,
        403,
        "forbidden_domain",
      );
    }

    const firstName = typeof user.user_metadata?.first_name === "string"
      ? user.user_metadata.first_name
      : user.email.split("@")[0];

    const adminClient = getServiceClient();
    await sendPortalConfirmationEmail(adminClient, email, firstName);

    return jsonResponse({ message: "Portal welcome email sent." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resend portal welcome email";
    logOnboarding("portal_confirmation_resend_request_failed", { error: message }, "error");
    return errorResponse(message, 500, "resend_failed");
  }
});
