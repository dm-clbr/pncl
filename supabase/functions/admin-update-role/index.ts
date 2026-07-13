import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, getUserRole, requireAdmin, type PortalRole } from "../_shared/adminAuth.ts";
import { countAdmins } from "../_shared/adminAgents.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";

interface UpdateRolePayload {
  userId: string;
  role: PortalRole;
}

const VALID_ROLES: PortalRole[] = ["admin", "genesis_admin", "admin_assist", "agent"];

function validateUpdateRolePayload(body: unknown): UpdateRolePayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!isValidReferrerUserId(userId)) {
    throw new Error("Valid user id is required");
  }

  const role = data.role;
  if (!VALID_ROLES.includes(role as PortalRole)) {
    throw new Error("Role must be admin, genesis_admin, admin_assist, or agent");
  }

  return { userId, role: role as PortalRole };
}

function roleUpdateMessage(role: PortalRole): string {
  switch (role) {
    case "admin":
      return "User promoted to admin.";
    case "genesis_admin":
      return "User promoted to Genesis admin.";
    case "admin_assist":
      return "User promoted to admin assist.";
    default:
      return "Elevated access removed.";
  }
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const payload = validateUpdateRolePayload(await req.json());

    const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(payload.userId);
    if (targetError || !targetData.user) {
      return errorResponse("User not found", 404, "not_found");
    }

    const currentRole = getUserRole(targetData.user);

    if (currentRole === "admin" && payload.role !== "admin") {
      const adminCount = await countAdmins(adminClient);
      if (adminCount <= 1) {
        return errorResponse("Cannot remove the last admin", 409, "last_admin");
      }
    }

    if (payload.userId === adminUser.id && currentRole === "admin" && payload.role !== "admin") {
      return errorResponse("You cannot remove your own admin access", 409, "self_demote");
    }

    const appMetadata = { ...targetData.user.app_metadata } as Record<string, unknown>;
    if (payload.role === "agent") {
      delete appMetadata.role;
    } else {
      appMetadata.role = payload.role;
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(payload.userId, {
      app_metadata: appMetadata,
    });

    if (updateError) {
      logOnboarding("admin_update_role_failed", {
        userId: payload.userId,
        error: updateError.message,
      }, "error");
      return errorResponse("Unable to update role", 500, "update_failed");
    }

    logOnboarding("admin_role_updated", {
      adminId: adminUser.id,
      userId: payload.userId,
      previousRole: currentRole,
      newRole: payload.role,
    });

    return jsonResponse({
      userId: payload.userId,
      role: payload.role,
      message: roleUpdateMessage(payload.role),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to update role";
    logOnboarding("admin_update_role_request_failed", { error: message }, "error");
    return errorResponse(message, 500, "update_failed");
  }
});
