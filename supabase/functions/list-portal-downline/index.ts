import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import {
  computeAgentPhases,
  resolveDisplayName,
  type AgentPhase,
} from "../_shared/adminAgents.ts";
import { computePortalTodoProgressByUserId, type PortalTodoProgressSummary } from "../_shared/portalTodos.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";

interface DownlineOnboardingRow {
  id: string;
  supabase_user_id: string | null;
  legal_name: string;
  first_name: string;
  last_name: string;
  status: string;
  workspace_email: string | null;
  referral_invite_id: string | null;
  invited_comp_level: number | null;
  onboarding_completed_at: string | null;
  created_at: string;
}

interface ReferralInviteLabelRow {
  id: string;
  recipient_label: string | null;
}

interface PortalProfileNameRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface DownlineMemberSummary {
  onboardingId: string;
  userId: string | null;
  name: string;
  inviteLabel: string | null;
  invitedCompLevel: number | null;
  onboardingStatus: string;
  portalPhase: AgentPhase | null;
  hasPortalAccount: boolean;
  onboardingCompletedAt: string | null;
  joinedAt: string;
  todoProgress: PortalTodoProgressSummary | null;
}

function resolveOnboardingName(row: DownlineOnboardingRow): string {
  const legal = row.legal_name?.trim();
  if (legal) return legal;

  const first = row.first_name?.trim() ?? "";
  const last = row.last_name?.trim() ?? "";
  const combined = [first, last].filter(Boolean).join(" ");
  return combined || "Recruit";
}

function resolveProfileName(row: PortalProfileNameRow): string | null {
  const first = row.first_name?.trim() ?? "";
  const last = row.last_name?.trim() ?? "";
  const combined = [first, last].filter(Boolean).join(" ");
  return combined || null;
}

async function loadPortalUsersByIds(
  adminClient: SupabaseClient,
  userIds: string[],
): Promise<Map<string, User>> {
  const usersById = new Map<string, User>();
  if (userIds.length === 0) return usersById;

  const results = await Promise.all(
    userIds.map(async (userId) => {
      const { data, error } = await adminClient.auth.admin.getUserById(userId);
      if (error || !data.user) return null;
      return data.user;
    }),
  );

  for (const user of results) {
    if (user) {
      usersById.set(user.id, user);
    }
  }

  return usersById;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);

    const { data: onboardingRows, error: onboardingError } = await adminClient
      .from("onboarding_records")
      .select(`
        id,
        supabase_user_id,
        legal_name,
        first_name,
        last_name,
        status,
        workspace_email,
        referral_invite_id,
        invited_comp_level,
        onboarding_completed_at,
        created_at
      `)
      .eq("referrer_user_id", user.id)
      .not("status", "eq", "failed")
      .order("created_at", { ascending: false });

    if (onboardingError) {
      throw new Error(onboardingError.message);
    }

    const rows = (onboardingRows ?? []) as DownlineOnboardingRow[];
    if (rows.length === 0) {
      return jsonResponse({ members: [] as DownlineMemberSummary[] });
    }

    const inviteIds = [
      ...new Set(
        rows
          .map((row) => row.referral_invite_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];

    const userIds = [
      ...new Set(
        rows
          .map((row) => row.supabase_user_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];

    const [inviteLabels, profileRows, portalUsers] = await Promise.all([
      inviteIds.length > 0
        ? adminClient
          .from("portal_referral_invites")
          .select("id, recipient_label")
          .in("id", inviteIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length > 0
        ? adminClient
          .from("portal_profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      loadPortalUsersByIds(adminClient, userIds),
    ]);

    if (inviteLabels.error) throw new Error(inviteLabels.error.message);
    if (profileRows.error) throw new Error(profileRows.error.message);

    const inviteLabelById = new Map<string, string | null>();
    for (const invite of (inviteLabels.data ?? []) as ReferralInviteLabelRow[]) {
      inviteLabelById.set(invite.id, invite.recipient_label);
    }

    const profileNameByUserId = new Map<string, string | null>();
    for (const profile of (profileRows.data ?? []) as PortalProfileNameRow[]) {
      profileNameByUserId.set(profile.user_id, resolveProfileName(profile));
    }

    const portalUserList = [...portalUsers.values()];
    const [phasesByUserId, todoProgressByUserId] = await Promise.all([
      computeAgentPhases(adminClient, portalUserList),
      computePortalTodoProgressByUserId(adminClient, portalUserList),
    ]);

    const members: DownlineMemberSummary[] = rows.map((row) => {
      const userId = row.supabase_user_id;
      const hasPortalAccount = !!userId && portalUsers.has(userId);
      const portalUser = userId ? portalUsers.get(userId) : undefined;
      const profileName = userId ? profileNameByUserId.get(userId) ?? null : null;
      const portalPhase = userId ? phasesByUserId.get(userId) ?? null : null;
      const todoProgress = userId ? todoProgressByUserId.get(userId) ?? null : null;

      const name = profileName
        ?? (portalUser ? resolveDisplayName(portalUser, resolveOnboardingName(row)) : resolveOnboardingName(row));

      const inviteLabel = row.referral_invite_id
        ? inviteLabelById.get(row.referral_invite_id) ?? null
        : null;

      return {
        onboardingId: row.id,
        userId,
        name,
        inviteLabel,
        invitedCompLevel: row.invited_comp_level,
        onboardingStatus: row.status,
        portalPhase,
        hasPortalAccount,
        onboardingCompletedAt: row.onboarding_completed_at,
        joinedAt: row.created_at,
        todoProgress,
      };
    });

    return jsonResponse({ members });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load downline";
    return errorResponse(message, 500);
  }
});
