import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { buildAgentSummaryForUser } from "../_shared/adminAgents.ts";
import {
  loadAdminUserDocuments,
  validateAdminUserProfileQuery,
  type AdminUserDocument,
} from "../_shared/adminUserProfile.ts";
import { mapDirectDepositSummary, type DirectDepositRecord } from "../_shared/portalDirectDeposit.ts";
import { mapPortalW9Summary, type PortalW9Record } from "../_shared/portalW9.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

interface PortalProfileRow {
  user_id: string;
  first_name: string;
  last_name: string;
  shirt_size: string | null;
  polo_shirt_size: string | null;
  hoodie_size: string | null;
  waist_size: string | null;
  shoe_size: string | null;
  profile_photo_path: string | null;
  updated_at: string;
}

function getCompletedTodos(metadata: Record<string, unknown> | undefined): Record<string, boolean> {
  const value = metadata?.completed_portal_todos;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, boolean>;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireGenesisAdminOrAdmin(req);
    const { userId } = validateAdminUserProfileQuery(new URL(req.url));

    const agent = await buildAgentSummaryForUser(adminClient, userId, { includeSensitive: true });
    if (!agent) {
      return errorResponse("User not found", 404, "not_found");
    }

    const [
      { data: profileRow },
      { data: w9Row },
      { data: directDepositRow },
      { data: userData },
    ] = await Promise.all([
      adminClient.from("portal_profiles").select("*").eq("user_id", userId).maybeSingle(),
      adminClient.from("portal_w9_forms").select("*").eq("user_id", userId).maybeSingle(),
      adminClient.from("portal_direct_deposit_forms").select("*").eq("user_id", userId).maybeSingle(),
      adminClient.auth.admin.getUserById(userId),
    ]);

    const w9Record = w9Row as PortalW9Record | null;
    const directDepositRecord = directDepositRow as DirectDepositRecord | null;

    let documents: AdminUserDocument[] = [];
    if (w9Record || directDepositRecord) {
      documents = await loadAdminUserDocuments(adminClient, userId, w9Record, directDepositRecord);
    } else {
      documents = await loadAdminUserDocuments(adminClient, userId, null, null);
    }

    let profilePhotoUrl: string | null = null;
    const profile = profileRow as PortalProfileRow | null;
    if (profile?.profile_photo_path) {
      const { data: photoData } = adminClient.storage
        .from("portal-profile-photos")
        .getPublicUrl(profile.profile_photo_path);
      profilePhotoUrl = photoData.publicUrl;
    }

    const completedTodos = getCompletedTodos(
      userData.user?.user_metadata as Record<string, unknown> | undefined,
    );

    logOnboarding("admin_user_profile_viewed", { userId });

    return jsonResponse({
      agent,
      portalProfile: profile
        ? {
            firstName: profile.first_name,
            lastName: profile.last_name,
            shirtSize: profile.shirt_size,
            poloShirtSize: profile.polo_shirt_size,
            hoodieSize: profile.hoodie_size,
            waistSize: profile.waist_size,
            shoeSize: profile.shoe_size,
            profilePhotoUrl,
            updatedAt: profile.updated_at,
          }
        : null,
      w9: w9Record ? mapPortalW9Summary(w9Record) : null,
      directDeposit: directDepositRecord ? mapDirectDepositSummary(directDepositRecord) : null,
      completedPortalTodos: completedTodos,
      documents,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load user profile";
    logOnboarding("admin_get_user_profile_failed", { error: message }, "error");
    return errorResponse(message, 500, "load_failed");
  }
});
