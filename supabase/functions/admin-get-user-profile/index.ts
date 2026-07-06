import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { buildAgentSummaryForUser } from "../_shared/adminAgents.ts";
import {
  getWorkspaceUser,
  resolveGoogleWorkspaceStatus,
} from "../_shared/googleWorkspace.ts";
import {
  loadAdminUserDocumentsWithContract,
  validateAdminUserProfileQuery,
  type AdminUserDocument,
} from "../_shared/adminUserProfile.ts";
import { mapDirectDepositSummary, type DirectDepositRecord } from "../_shared/portalDirectDeposit.ts";
import { mapPortalW9Summary, type PortalW9Record } from "../_shared/portalW9.ts";
import {
  computeAutoCompletionSets,
  getCompletedTodosFromMetadata,
  isTodoCompleteForUser,
  type PortalTodoRecord,
} from "../_shared/portalTodos.ts";
import { PORTAL_PROFILE_DOCUMENTS_BUCKET } from "../_shared/portalProfileSetup.ts";
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
  npn: string | null;
  eo_policy_number: string | null;
  state_licenses: string[] | null;
  drivers_license_path: string | null;
  updated_at: string;
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
      { data: todoRows, error: todoError },
    ] = await Promise.all([
      adminClient.from("portal_profiles").select("*").eq("user_id", userId).maybeSingle(),
      adminClient.from("portal_w9_forms").select("*").eq("user_id", userId).maybeSingle(),
      adminClient.from("portal_direct_deposit_forms").select("*").eq("user_id", userId).maybeSingle(),
      adminClient.auth.admin.getUserById(userId),
      adminClient
        .from("portal_todos")
        .select("*")
        .eq("published", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (todoError) {
      throw new Error(todoError.message);
    }

    const w9Record = w9Row as PortalW9Record | null;
    const directDepositRecord = directDepositRow as DirectDepositRecord | null;

    const { data: onboardingRow } = await adminClient
      .from("onboarding_records")
      .select("id")
      .eq("supabase_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const documents = await loadAdminUserDocumentsWithContract(
      adminClient,
      userId,
      onboardingRow?.id ?? null,
      w9Record,
      directDepositRecord,
    );

    let profilePhotoUrl: string | null = null;
    const profile = profileRow as PortalProfileRow | null;
    if (profile?.profile_photo_path) {
      const { data: photoData } = adminClient.storage
        .from("portal-profile-photos")
        .getPublicUrl(profile.profile_photo_path);
      profilePhotoUrl = photoData.publicUrl;
    }

    let driversLicenseUrl: string | null = null;
    if (profile?.drivers_license_path) {
      const { data: licenseData } = await adminClient.storage
        .from(PORTAL_PROFILE_DOCUMENTS_BUCKET)
        .createSignedUrl(profile.drivers_license_path, 3600);
      driversLicenseUrl = licenseData?.signedUrl ?? null;
    }

    const completedTodos = getCompletedTodosFromMetadata(
      userData.user?.user_metadata as Record<string, unknown> | undefined,
    );

    const todoRecords = (todoRows ?? []) as PortalTodoRecord[];
    const autoKeys = new Set(
      todoRecords
        .filter((row) => row.completion_type === "auto" && row.auto_key)
        .map((row) => row.auto_key as string),
    );
    const autoSets = await computeAutoCompletionSets(adminClient, autoKeys, [userId]);
    const todos = todoRecords.map((row) => ({
      slug: row.slug,
      title: row.title,
      description: row.description,
      phase: row.phase ?? "on_board",
      completionType: row.completion_type ?? "agent",
      autoKey: row.auto_key ?? null,
      completed: isTodoCompleteForUser(row, userId, completedTodos, autoSets),
      manuallyCompleted: completedTodos[row.slug] === true,
    }));

    let googleWorkspace: {
      status: string;
      suspensionReason: string | null;
      recoveryEmail: string | null;
      recoveryPhone: string | null;
      mobilePhone: string | null;
      lastLoginTime: string | null;
      loadError: string | null;
    } | null = null;

    const workspaceEmail = agent.onboarding?.workspaceEmail?.trim().toLowerCase()
      ?? agent.email.trim().toLowerCase();

    if (workspaceEmail) {
      try {
        const googleUser = await getWorkspaceUser(workspaceEmail);
        if (googleUser) {
          const resolved = resolveGoogleWorkspaceStatus(googleUser);
          agent.googleWorkspaceStatus = resolved.status;
          agent.googleSuspensionReason = resolved.suspensionReason;
          googleWorkspace = {
            status: resolved.status,
            suspensionReason: resolved.suspensionReason,
            recoveryEmail: googleUser.recoveryEmail,
            recoveryPhone: googleUser.recoveryPhone,
            mobilePhone: googleUser.mobilePhone,
            lastLoginTime: googleUser.lastLoginTime,
            loadError: null,
          };
        } else {
          agent.googleWorkspaceStatus = "not_found";
          agent.googleSuspensionReason = null;
          googleWorkspace = {
            status: "not_found",
            suspensionReason: null,
            recoveryEmail: null,
            recoveryPhone: null,
            mobilePhone: null,
            lastLoginTime: null,
            loadError: null,
          };
        }
      } catch (googleError) {
        const message = googleError instanceof Error
          ? googleError.message
          : "Unable to load Google Workspace user";
        agent.googleWorkspaceStatus = "unknown";
        agent.googleSuspensionReason = null;
        googleWorkspace = {
          status: "unknown",
          suspensionReason: null,
          recoveryEmail: null,
          recoveryPhone: null,
          mobilePhone: null,
          lastLoginTime: null,
          loadError: message,
        };
        logOnboarding("admin_user_profile_google_load_failed", { userId, error: message }, "warn");
      }
    }

    logOnboarding("admin_user_profile_viewed", { userId });

    return jsonResponse({
      agent,
      googleWorkspace,
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
            npn: profile.npn,
            eoPolicyNumber: profile.eo_policy_number,
            stateLicenses: profile.state_licenses ?? [],
            driversLicenseUrl,
            updatedAt: profile.updated_at,
          }
        : null,
      w9: w9Record ? mapPortalW9Summary(w9Record) : null,
      directDeposit: directDepositRecord ? mapDirectDepositSummary(directDepositRecord) : null,
      completedPortalTodos: completedTodos,
      todos,
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
