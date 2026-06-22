import { getSupabaseConfig } from "@/lib/supabase";
import type { PortalRole } from "@/lib/roles";

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

export interface CreateUserInput {
  legalName: string;
  email: string;
  uplineNetwork?: string;
  referrerUserId?: string;
}

async function adminFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      ...init?.headers,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Admin request failed");
  }
  return data as T;
}

export async function listAgents(accessToken: string): Promise<AgentSummary[]> {
  const data = await adminFetch<{ agents: AgentSummary[] }>("admin-list-agents", accessToken, {
    method: "GET",
  });
  return data.agents;
}

export async function getHierarchy(
  accessToken: string,
  rootUserId?: string,
): Promise<{ tree: HierarchyNode[]; totalAgents: number }> {
  const params = rootUserId ? `?root=${encodeURIComponent(rootUserId)}` : "";
  return adminFetch(`admin-get-hierarchy${params}`, accessToken, { method: "GET" });
}

export async function createUser(
  accessToken: string,
  input: CreateUserInput,
): Promise<{ id: string; email: string; name: string; message: string }> {
  return adminFetch("admin-create-user", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateUserRole(
  accessToken: string,
  userId: string,
  role: PortalRole,
): Promise<{ userId: string; role: PortalRole; message: string }> {
  return adminFetch("admin-update-role", accessToken, {
    method: "POST",
    body: JSON.stringify({ userId, role }),
  });
}
