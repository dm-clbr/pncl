import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getEmailDomain } from "./onboarding.ts";
import { getUserRole, type PortalRole } from "./adminAuth.ts";

export interface AgentSummary {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  referrerId: string | null;
  referrerName: string | null;
  uplineNetwork: string | null;
  status: string | null;
  emailConfirmed: boolean;
  genesisAccountCreatedAt: string | null;
  createdAt: string;
  source: string | null;
}

export interface HierarchyNode {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  status: string | null;
  children: HierarchyNode[];
}

interface OnboardingRow {
  supabase_user_id: string | null;
  legal_name: string;
  referrer_user_id: string | null;
  upline_network: string;
  status: string;
  workspace_email: string | null;
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

async function loadOnboardingByUserId(
  adminClient: SupabaseClient,
): Promise<Map<string, OnboardingRow>> {
  const { data, error } = await adminClient
    .from("onboarding_records")
    .select("supabase_user_id, legal_name, referrer_user_id, upline_network, status, workspace_email")
    .not("status", "eq", "failed");

  if (error) throw error;

  const map = new Map<string, OnboardingRow>();
  for (const row of data ?? []) {
    if (row.supabase_user_id) {
      map.set(row.supabase_user_id, row as OnboardingRow);
    }
  }
  return map;
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

export async function buildAgentSummaries(adminClient: SupabaseClient): Promise<AgentSummary[]> {
  const [users, onboardingByUserId] = await Promise.all([
    listPortalUsers(adminClient),
    loadOnboardingByUserId(adminClient),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));

  return users.map((user) => {
    const onboarding = onboardingByUserId.get(user.id);
    const referrerId = onboarding?.referrer_user_id ?? null;

    const genesisCreatedAt = user.user_metadata?.genesis_account_created_at;
    const genesisAccountCreatedAt = typeof genesisCreatedAt === "string" && genesisCreatedAt.trim()
      ? genesisCreatedAt
      : null;

    return {
      id: user.id,
      email: user.email ?? "",
      name: resolveDisplayName(user, onboarding?.legal_name),
      role: getUserRole(user),
      referrerId,
      referrerName: resolveReferrerName(referrerId, usersById, onboardingByUserId),
      uplineNetwork: onboarding?.upline_network ?? null,
      status: onboarding?.status ?? null,
      emailConfirmed: Boolean(user.email_confirmed_at),
      genesisAccountCreatedAt,
      createdAt: user.created_at,
      source: typeof user.app_metadata?.source === "string" ? user.app_metadata.source : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function buildHierarchyTree(
  agents: AgentSummary[],
  rootUserId?: string,
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
    return {
      id: agent.id,
      email: agent.email,
      name: agent.name,
      role: agent.role,
      status: agent.status,
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
