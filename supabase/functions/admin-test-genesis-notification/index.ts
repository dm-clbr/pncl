import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendTestGenesisNotificationToAdmins } from "../_shared/genesisNotifications.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireGenesisAdminOrAdmin(req);
    const { recipients } = await sendTestGenesisNotificationToAdmins(adminClient);

    logOnboarding("admin_genesis_test_notification_sent", {
      adminId: adminUser.id,
      recipients,
    });

    return jsonResponse({
      recipients,
      message: `Test notification sent to ${recipients.length} genesis admin${recipients.length === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to send test notification";
    logOnboarding("admin_genesis_test_notification_failed", { error: message }, "error");
    return errorResponse(message, 500, "send_failed");
  }
});
