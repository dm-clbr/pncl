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

export async function resendActivationEmail(
  accessToken: string,
  userId: string,
): Promise<{ userId: string; email: string; message: string }> {
  return adminFetch("admin-resend-activation", accessToken, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function markGenesisAccountCreated(
  accessToken: string,
  userId: string,
): Promise<{ userId: string; genesisAccountCreatedAt: string; message: string }> {
  return adminFetch("admin-mark-genesis-created", accessToken, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export interface AdminIncentiveSummary {
  id: string;
  slug: string;
  title: string;
  type: "image" | "video";
  src: string;
  poster: string | null;
  href: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertIncentivePayload {
  id?: string;
  slug?: string;
  title: string;
  type: "image" | "video";
  src: string;
  poster?: string | null;
  href?: string | null;
  published?: boolean;
  sortOrder?: number;
}

export async function listIncentives(accessToken: string): Promise<AdminIncentiveSummary[]> {
  const data = await adminFetch<{ incentives: AdminIncentiveSummary[] }>(
    "admin-list-incentives",
    accessToken,
    { method: "GET" },
  );
  return data.incentives;
}

export async function upsertIncentive(
  accessToken: string,
  input: UpsertIncentivePayload,
): Promise<{ incentive: AdminIncentiveSummary; message: string }> {
  return adminFetch("admin-upsert-incentive", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteIncentive(
  accessToken: string,
  id: string,
): Promise<{ id: string; message: string }> {
  return adminFetch("admin-delete-incentive", accessToken, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function reorderIncentives(
  accessToken: string,
  orderedIds: string[],
): Promise<{ message: string }> {
  return adminFetch("admin-reorder-incentives", accessToken, {
    method: "POST",
    body: JSON.stringify({ orderedIds }),
  });
}

export interface AdminCarrierSummary {
  id: string;
  carrier: string;
  companyNumber: string;
  eAppLabel: string;
  eAppUrl: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCarrierPayload {
  id?: string;
  carrier: string;
  companyNumber: string;
  eAppLabel: string;
  eAppUrl?: string | null;
  published?: boolean;
  sortOrder?: number;
}

export async function listCarriers(accessToken: string): Promise<AdminCarrierSummary[]> {
  const data = await adminFetch<{ carriers: AdminCarrierSummary[] }>(
    "admin-list-carriers",
    accessToken,
    { method: "GET" },
  );
  return data.carriers;
}

export async function upsertCarrier(
  accessToken: string,
  input: UpsertCarrierPayload,
): Promise<{ carrier: AdminCarrierSummary; message: string }> {
  return adminFetch("admin-upsert-carrier", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteCarrier(
  accessToken: string,
  id: string,
): Promise<{ id: string; message: string }> {
  return adminFetch("admin-delete-carrier", accessToken, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function reorderCarriers(
  accessToken: string,
  orderedIds: string[],
): Promise<{ message: string }> {
  return adminFetch("admin-reorder-carriers", accessToken, {
    method: "POST",
    body: JSON.stringify({ orderedIds }),
  });
}
