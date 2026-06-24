import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getEmailDomain } from "./onboarding.ts";
import { getUserRole, type PortalRole } from "./adminAuth.ts";
import { decryptTemporaryPassword } from "./security.ts";
import { loadCompLevelsByUserId } from "./portalReferralInvites.ts";

export type GenesisAccountStatus = "pending" | "created" | "skipped";

export interface AgentOnboardingDetails {
  legalName: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  dateOfBirth: string;
  ssn: string | null;
  stateOfResidence: string;
  uplineNetwork: string;
  hasLicense: string;
  npn: string | null;
  hasEoInsurance: string;
  workspaceEmail: string | null;
}

export interface AgentSummary {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  compLevel: number | null;
  referrerId: string | null;
  referrerName: string | null;
  uplineNetwork: string | null;
  status: string | null;
  emailConfirmed: boolean;
  genesisAccountCreatedAt: string | null;
  genesisAccountSkippedAt: string | null;
  genesisStatus: GenesisAccountStatus;
  onboardingCompletedAt: string | null;
  onboarding: AgentOnboardingDetails | null;
  hasOnboardingRecord: boolean;
  createdAt: string;
  source: string | null;
}

export interface HierarchyNode {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  status: string | null;
  profilePhotoPath: string | null;
  profileUpdatedAt: string | null;
  children: HierarchyNode[];
}

interface PortalProfilePhotoRow {
  user_id: string;
  profile_photo_path: string | null;
  updated_at: string;
}

interface OnboardingRow {
  supabase_user_id: string | null;
  legal_name: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  date_of_birth: string;
  ssn_encrypted: string;
  state_of_residence: string;
  referrer_user_id: string | null;
  upline_network: string;
  has_license: string;
  npn: string | null;
  has_eo_insurance: string;
  status: string;
  workspace_email: string | null;
  onboarding_completed_at: string | null;
}

function resolveDisplayName(user: User, onboardingName?: string | null): string {
  if (onboardingName?.trim()) return onboardingName.trim();

  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();

  const firstName = user.user_metadata?.first_name;
  const lastName = user.user_metadata?.last_name;
  if (typeof firstName === "string" && firstName.trim()) {
    const last = typeof lastName === "string" ? lastName.trim() : "";
    return [firstName.trim(), last].filter(Boolean).join(" ");
  }

  return user.email?.split("@")[0] ?? "Agent";
}

export async function listPortalUsers(adminClient: SupabaseClient): Promise<User[]> {
  const emailDomain = getEmailDomain();
  const users: User[] = [];
  let page = 1;

  while (page <= 20) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    if (!data.users.length) break;

    for (const user of data.users) {
      const email = user.email?.toLowerCase() ?? "";
      if (email.endsWith(`@${emailDomain}`)) {
        users.push(user);
      }
    }

    if (data.users.length < 200) break;
    page++;
  }

  return users;
}

async function loadOnboardingMaps(
  adminClient: SupabaseClient,
): Promise<{
  byUserId: Map<string, OnboardingRow>;
  byEmail: Map<string, OnboardingRow>;
  byId: Map<string, OnboardingRow>;
}> {
  const { data, error } = await adminClient
    .from("onboarding_records")
    .select(`
      id,
      supabase_user_id,
      legal_name,
      first_name,
      last_name,
      phone_number,
      date_of_birth,
      ssn_encrypted,
      state_of_residence,
      referrer_user_id,
      upline_network,
      has_license,
      npn,
      has_eo_insurance,
      status,
      workspace_email,
      onboarding_completed_at,
      created_at
    `)
    .not("status", "eq", "failed")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const byUserId = new Map<string, OnboardingRow>();
  const byEmail = new Map<string, OnboardingRow>();
  const byId = new Map<string, OnboardingRow>();

  for (const row of data ?? []) {
    const onboarding = row as OnboardingRow & { id: string; created_at: string };
    byId.set(onboarding.id, onboarding);

    if (onboarding.supabase_user_id && !byUserId.has(onboarding.supabase_user_id)) {
      byUserId.set(onboarding.supabase_user_id, onboarding);
    }

    const email = onboarding.workspace_email?.trim().toLowerCase();
    if (email && !byEmail.has(email)) {
      byEmail.set(email, onboarding);
    }
  }

  return { byUserId, byEmail, byId };
}

function resolveOnboardingForUser(
  user: User,
  maps: {
    byUserId: Map<string, OnboardingRow>;
    byEmail: Map<string, OnboardingRow>;
    byId: Map<string, OnboardingRow>;
  },
): OnboardingRow | undefined {
  const onboardingId = user.app_metadata?.onboarding_id;
  if (typeof onboardingId === "string" && maps.byId.has(onboardingId)) {
    return maps.byId.get(onboardingId);
  }

  const byUser = maps.byUserId.get(user.id);
  if (byUser) return byUser;

  const email = user.email?.trim().toLowerCase();
  if (email) {
    return maps.byEmail.get(email);
  }

  return undefined;
}

function resolveGenesisAccountStatus(
  genesisAccountCreatedAt: string | null,
  genesisAccountSkippedAt: string | null,
): GenesisAccountStatus {
  if (genesisAccountCreatedAt) return "created";
  if (genesisAccountSkippedAt) return "skipped";
  return "pending";
}

async function buildOnboardingDetails(
  onboarding: OnboardingRow,
  includeSensitive: boolean,
): Promise<AgentOnboardingDetails> {
  let ssn: string | null = null;
  if (includeSensitive && onboarding.ssn_encrypted) {
    try {
      ssn = await decryptTemporaryPassword(onboarding.ssn_encrypted);
    } catch {
      ssn = null;
    }
  }

  return {
    legalName: onboarding.legal_name,
    firstName: onboarding.first_name,
    lastName: onboarding.last_name,
    phoneNumber: onboarding.phone_number,
    dateOfBirth: onboarding.date_of_birth,
    ssn,
    stateOfResidence: onboarding.state_of_residence,
    uplineNetwork: onboarding.upline_network,
    hasLicense: onboarding.has_license,
    npn: onboarding.npn,
    hasEoInsurance: onboarding.has_eo_insurance,
    workspaceEmail: onboarding.workspace_email,
  };
}

function resolveReferrerName(
  referrerId: string | null,
  usersById: Map<string, User>,
  onboardingByUserId: Map<string, OnboardingRow>,
): string | null {
  if (!referrerId) return null;

  const onboarding = onboardingByUserId.get(referrerId);
  if (onboarding?.legal_name) return onboarding.legal_name;

  const user = usersById.get(referrerId);
  if (!user) return null;
  return resolveDisplayName(user, onboarding?.legal_name);
}

export async function buildAgentSummaries(
  adminClient: SupabaseClient,
  options?: { includeSensitive?: boolean },
): Promise<AgentSummary[]> {
  const includeSensitive = options?.includeSensitive ?? false;
  const [users, onboardingMaps, compLevelsByUserId] = await Promise.all([
    listPortalUsers(adminClient),
    loadOnboardingMaps(adminClient),
    loadCompLevelsByUserId(adminClient),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));

  const summaries = await Promise.all(users.map(async (user) => {
    const onboarding = resolveOnboardingForUser(user, onboardingMaps);
    const referrerId = onboarding?.referrer_user_id ?? null;

    const genesisCreatedAt = user.user_metadata?.genesis_account_created_at;
    const genesisAccountCreatedAt = typeof genesisCreatedAt === "string" && genesisCreatedAt.trim()
      ? genesisCreatedAt
      : null;

    const genesisSkippedAt = user.user_metadata?.genesis_account_skipped_at;
    const genesisAccountSkippedAt = typeof genesisSkippedAt === "string" && genesisSkippedAt.trim()
      ? genesisSkippedAt
      : null;

    const onboardingDetails = onboarding
      ? await buildOnboardingDetails(onboarding, includeSensitive)
      : null;

    return {
      id: user.id,
      email: user.email ?? "",
      name: resolveDisplayName(user, onboarding?.legal_name),
      role: getUserRole(user),
      compLevel: compLevelsByUserId.get(user.id) ?? null,
      referrerId,
      referrerName: resolveReferrerName(referrerId, usersById, onboardingMaps.byUserId),
      uplineNetwork: onboarding?.upline_network ?? null,
      status: onboarding?.status ?? null,
      emailConfirmed: Boolean(user.email_confirmed_at),
      genesisAccountCreatedAt,
      genesisAccountSkippedAt,
      genesisStatus: resolveGenesisAccountStatus(genesisAccountCreatedAt, genesisAccountSkippedAt),
      onboardingCompletedAt: onboarding?.onboarding_completed_at ?? null,
      onboarding: onboardingDetails,
      hasOnboardingRecord: Boolean(onboarding),
      createdAt: user.created_at,
      source: typeof user.app_metadata?.source === "string" ? user.app_metadata.source : null,
    };
  }));

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadPortalProfilePhotos(
  adminClient: SupabaseClient,
): Promise<Map<string, { profilePhotoPath: string | null; profileUpdatedAt: string | null }>> {
  const { data, error } = await adminClient
    .from("portal_profiles")
    .select("user_id, profile_photo_path, updated_at");

  if (error) throw error;

  const map = new Map<string, { profilePhotoPath: string | null; profileUpdatedAt: string | null }>();
  for (const row of (data ?? []) as PortalProfilePhotoRow[]) {
    map.set(row.user_id, {
      profilePhotoPath: row.profile_photo_path,
      profileUpdatedAt: row.updated_at,
    });
  }
  return map;
}

export function buildHierarchyTree(
  agents: AgentSummary[],
  rootUserId?: string,
  profilesByUserId?: Map<string, { profilePhotoPath: string | null; profileUpdatedAt: string | null }>,
): HierarchyNode[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const childrenByReferrer = new Map<string, AgentSummary[]>();

  for (const agent of agents) {
    if (!agent.referrerId || !byId.has(agent.referrerId)) continue;
    const siblings = childrenByReferrer.get(agent.referrerId) ?? [];
    siblings.push(agent);
    childrenByReferrer.set(agent.referrerId, siblings);
  }

  const toNode = (agent: AgentSummary): HierarchyNode => {
    const children = (childrenByReferrer.get(agent.id) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toNode);
    const profile = profilesByUserId?.get(agent.id);
    return {
      id: agent.id,
      email: agent.email,
      name: agent.name,
      role: agent.role,
      status: agent.status,
      profilePhotoPath: profile?.profilePhotoPath ?? null,
      profileUpdatedAt: profile?.profileUpdatedAt ?? null,
      children,
    };
  };

  if (rootUserId) {
    const root = byId.get(rootUserId);
    return root ? [toNode(root)] : [];
  }

  const roots = agents.filter(
    (agent) => !agent.referrerId || !byId.has(agent.referrerId),
  );

  return roots
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toNode);
}

export async function countAdmins(adminClient: SupabaseClient): Promise<number> {
  const users = await listPortalUsers(adminClient);
  return users.filter((user) => getUserRole(user) === "admin").length;
}

export async function findPortalUserIdByEmail(
  adminClient: SupabaseClient,
  email: string,
): Promise<string | null> {
  const normalized = email.toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) break;

    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match.id;

    if (data.users.length < 200) break;
    page++;
  }

  return null;
}

export async function loadOnboardingForPortalUser(
  adminClient: SupabaseClient,
  userId: string,
  email: string,
): Promise<OnboardingRow & { id: string } | null> {
  const { data: byUserId } = await adminClient
    .from("onboarding_records")
    .select("id, supabase_user_id, legal_name, referrer_user_id, upline_network, status, workspace_email")
    .eq("supabase_user_id", userId)
    .maybeSingle();

  if (byUserId) return byUserId as OnboardingRow & { id: string };

  const { data: byEmail } = await adminClient
    .from("onboarding_records")
    .select("id, supabase_user_id, legal_name, referrer_user_id, upline_network, status, workspace_email")
    .eq("workspace_email", email)
    .maybeSingle();

  return (byEmail as (OnboardingRow & { id: string }) | null) ?? null;
}

export async function countDownlineAgents(
  adminClient: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await adminClient
    .from("onboarding_records")
    .select("id", { count: "exact", head: true })
    .eq("referrer_user_id", userId)
    .not("status", "eq", "failed");

  if (error) throw error;
  return count ?? 0;
}

export async function getDescendantUserIds(
  adminClient: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const descendants = new Set<string>();
  const queue = [userId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const { data, error } = await adminClient
      .from("onboarding_records")
      .select("supabase_user_id")
      .eq("referrer_user_id", current)
      .not("status", "eq", "failed");

    if (error) throw error;

    for (const row of data ?? []) {
      const childId = row.supabase_user_id as string | null;
      if (!childId || descendants.has(childId)) continue;
      descendants.add(childId);
      queue.push(childId);
    }
  }

  return descendants;
}
