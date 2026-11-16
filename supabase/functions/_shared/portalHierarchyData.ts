import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computeAgentPhases, listPortalUsers, resolveDisplayName } from "./adminAgents.ts";
import { buildAssistHierarchyTree } from "./assistHierarchy.ts";
import { isValidCompLevel } from "./compLevel.ts";
import { loadHierarchyPartnerLinks } from "./hierarchyPartners.ts";
import { logOnboarding } from "./logger.ts";
import { buildPortalHierarchyResponse } from "./portalHierarchy.ts";

interface ReferralRow {
  id: string;
  supabase_user_id: string | null;
  workspace_email: string | null;
  legal_name: string | null;
  referrer_user_id: string | null;
  npn: string | null;
}

/** Resolve membership without loading the administrative summary or checklist data. */
export async function loadPortalTeamScope(adminClient: SupabaseClient, userId: string) {
  const [users, referrals, partners] = await Promise.all([
    listPortalUsers(adminClient),
    adminClient.from("onboarding_records")
      .select("id, supabase_user_id, workspace_email, legal_name, referrer_user_id, npn")
      .not("status", "eq", "failed").order("created_at", { ascending: false }),
    loadHierarchyPartnerLinks(adminClient),
  ]);
  if (referrals.error) throw referrals.error;
  const byId = new Map<string, ReferralRow>();
  const byUser = new Map<string, ReferralRow>();
  const byEmail = new Map<string, ReferralRow>();
  for (const row of (referrals.data ?? []) as ReferralRow[]) {
    byId.set(row.id, row);
    if (row.supabase_user_id && !byUser.has(row.supabase_user_id)) byUser.set(row.supabase_user_id, row);
    const email = row.workspace_email?.trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, row);
  }
  const agents = users.map(user => {
    // Match the admin hierarchy's trusted enrollment link and legacy fallbacks.
    const onboardingId = user.app_metadata?.onboarding_id;
    const row = (typeof onboardingId === "string" ? byId.get(onboardingId) : undefined)
      ?? byUser.get(user.id) ?? byEmail.get(user.email?.trim().toLowerCase() ?? "");
    return {
      id: user.id, name: resolveDisplayName(user, row?.legal_name), npn: row?.npn?.trim() || null,
      referrerId: row?.referrer_user_id ?? null, referrerName: null,
    };
  });
  const ids = new Set<string>();
  const collect = (nodes: ReturnType<typeof buildAssistHierarchyTree>) => {
    for (const node of nodes) {
      for (const id of node.memberIds ?? [node.id]) ids.add(id);
      collect(node.children);
    }
  };
  collect(buildAssistHierarchyTree(agents, userId, partners));
  return { ids: [...ids], agents: agents.filter(agent => ids.has(agent.id)), users: users.filter(user => ids.has(user.id)), partners };
}

export async function loadPortalHierarchy(adminClient: SupabaseClient, userId: string) {
  const scope = await loadPortalTeamScope(adminClient, userId);
  if (!scope.ids.length) return buildPortalHierarchyResponse([], userId, []);
  const [profiles, history, phases] = await Promise.all([
    adminClient.from("portal_profiles")
      .select("user_id, comp_level, npn, profile_photo_path, updated_at").in("user_id", scope.ids),
    adminClient.from("portal_profile_comp_level_history").select("user_id, effective_at")
      .in("user_id", scope.ids).order("effective_at", { ascending: false }),
    computeAgentPhases(adminClient, scope.users).catch(error => {
      logOnboarding("agent_phase_computation_failed", { error: error instanceof Error ? error.message : "phase computation failed" }, "warn");
      return new Map();
    }),
  ]);
  if (profiles.error) throw profiles.error;
  if (history.error) logOnboarding("comp_level_history_load_failed", { error: history.error.message }, "warn");
  const profileById = new Map((profiles.data ?? []).map(profile => [profile.user_id, profile]));
  const effectiveById = new Map<string, string>();
  for (const row of history.data ?? []) if (!effectiveById.has(row.user_id)) effectiveById.set(row.user_id, row.effective_at);
  const agents = scope.agents.map(agent => {
    const profile = profileById.get(agent.id);
    return {
      ...agent, npn: profile?.npn?.trim() || agent.npn,
      compLevel: typeof profile?.comp_level === "number" && isValidCompLevel(profile.comp_level) ? profile.comp_level : null,
      compLevelEffectiveAt: effectiveById.get(agent.id) ?? null,
      phase: phases.get(agent.id) ?? null,
      profilePhotoPath: profile?.profile_photo_path ?? null, profileUpdatedAt: profile?.updated_at ?? null,
    };
  });
  return buildPortalHierarchyResponse(agents, userId, scope.partners);
}
