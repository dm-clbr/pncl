import { getSupabaseConfig } from "@/lib/supabase";
import type { PortalRole } from "@/lib/roles";

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
  referrerId: string | null;
  referrerName: string | null;
  uplineNetwork: string | null;
  status: string | null;
  emailConfirmed: boolean;
  genesisAccountCreatedAt: string | null;
  genesisAccountSkippedAt: string | null;
  genesisStatus?: GenesisAccountStatus;
  onboardingCompletedAt: string | null;
  onboarding: AgentOnboardingDetails | null;
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

export interface AdminClientSummary {
  id: string;
  primaryFirstName: string;
  primaryLastName: string;
  primaryPhone: string | null;
  primaryEmail: string | null;
  address: string | null;
  dateMet: string | null;
  agentId: string;
  agentName: string;
  agentEmail: string;
  createdAt: string;
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

export async function listAdminClients(accessToken: string): Promise<AdminClientSummary[]> {
  const data = await adminFetch<{ clients: AdminClientSummary[] }>("admin-list-clients", accessToken, {
    method: "GET",
  });
  return data.clients;
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

export async function updateUserEmail(
  accessToken: string,
  userId: string,
  email: string,
): Promise<{ userId: string; email: string; message: string }> {
  return adminFetch("admin-update-user-email", accessToken, {
    method: "POST",
    body: JSON.stringify({ userId, email }),
  });
}

export async function deleteUser(
  accessToken: string,
  userId: string,
): Promise<{ userId: string; email: string; message: string }> {
  return adminFetch("admin-delete-user", accessToken, {
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

export async function skipGenesisAccount(
  accessToken: string,
  userId: string,
): Promise<{ userId: string; genesisAccountSkippedAt: string; message: string }> {
  return adminFetch("admin-skip-genesis", accessToken, {
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

export interface AdminBrandAssetSummary {
  id: string;
  title: string;
  description: string | null;
  assetType: "file" | "color";
  url: string;
  fileName: string;
  contentType: string;
  hexColor: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBrandAssetPayload {
  id?: string;
  title: string;
  description?: string | null;
  assetType?: "file" | "color";
  url?: string;
  fileName?: string;
  contentType?: string;
  hexColor?: string | null;
  published?: boolean;
  sortOrder?: number;
}

export async function listBrandAssets(accessToken: string): Promise<AdminBrandAssetSummary[]> {
  const data = await adminFetch<{ assets: AdminBrandAssetSummary[] }>(
    "admin-list-brand-assets",
    accessToken,
    { method: "GET" },
  );
  return data.assets;
}

export async function upsertBrandAsset(
  accessToken: string,
  input: UpsertBrandAssetPayload,
): Promise<{ asset: AdminBrandAssetSummary; message: string }> {
  return adminFetch("admin-upsert-brand-asset", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteBrandAsset(
  accessToken: string,
  id: string,
): Promise<{ id: string; message: string }> {
  return adminFetch("admin-delete-brand-asset", accessToken, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function reorderBrandAssets(
  accessToken: string,
  orderedIds: string[],
): Promise<{ message: string }> {
  return adminFetch("admin-reorder-brand-assets", accessToken, {
    method: "POST",
    body: JSON.stringify({ orderedIds }),
  });
}

export interface AdminDashboardLinkSummary {
  id: string;
  sectionId: string;
  title: string;
  description: string | null;
  href: string;
  external: boolean;
  icon: string;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDashboardFileSummary {
  id: string;
  sectionId: string;
  title: string;
  description: string | null;
  url: string;
  fileName: string;
  contentType: string;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDashboardSectionSummary {
  id: string;
  title: string;
  sortOrder: number;
  published: boolean;
  sectionType: "links" | "incentives" | "brand_assets" | "downloads";
  links: AdminDashboardLinkSummary[];
  files: AdminDashboardFileSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertDashboardSectionPayload {
  id: string;
  title: string;
  published?: boolean;
  sortOrder?: number;
  sectionType?: "links" | "incentives" | "brand_assets" | "downloads";
}

export interface UpsertDashboardLinkPayload {
  id?: string;
  sectionId: string;
  title: string;
  description?: string | null;
  href: string;
  external?: boolean;
  icon?: string;
  published?: boolean;
  sortOrder?: number;
}

export async function listDashboardTabs(
  accessToken: string,
): Promise<AdminDashboardSectionSummary[]> {
  const data = await adminFetch<{ sections: AdminDashboardSectionSummary[] }>(
    "admin-list-dashboard-tabs",
    accessToken,
    { method: "GET" },
  );
  return data.sections;
}

export async function upsertDashboardSection(
  accessToken: string,
  input: UpsertDashboardSectionPayload,
): Promise<{ section: AdminDashboardSectionSummary; message: string }> {
  return adminFetch("admin-upsert-dashboard-section", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function upsertDashboardLink(
  accessToken: string,
  input: UpsertDashboardLinkPayload,
): Promise<{ link: AdminDashboardLinkSummary; message: string }> {
  return adminFetch("admin-upsert-dashboard-link", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteDashboardSection(
  accessToken: string,
  id: string,
): Promise<{ id: string; message: string }> {
  return adminFetch("admin-delete-dashboard-section", accessToken, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function deleteDashboardLink(
  accessToken: string,
  id: string,
): Promise<{ id: string; message: string }> {
  return adminFetch("admin-delete-dashboard-link", accessToken, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function reorderDashboardSections(
  accessToken: string,
  sectionIds: string[],
): Promise<{ message: string }> {
  return adminFetch("admin-reorder-dashboard-tabs", accessToken, {
    method: "POST",
    body: JSON.stringify({ sectionIds }),
  });
}

export async function reorderDashboardLinks(
  accessToken: string,
  sectionId: string,
  linkIds: string[],
): Promise<{ message: string }> {
  return adminFetch("admin-reorder-dashboard-tabs", accessToken, {
    method: "POST",
    body: JSON.stringify({ sectionId, linkIds }),
  });
}

export type DashboardLinkPlacement = {
  sectionId: string;
  linkIds: string[];
};

export async function reorderDashboardLinkPlacements(
  accessToken: string,
  linkPlacements: DashboardLinkPlacement[],
): Promise<{ message: string }> {
  return adminFetch("admin-reorder-dashboard-tabs", accessToken, {
    method: "POST",
    body: JSON.stringify({ linkPlacements }),
  });
}

export interface UpsertDashboardFilePayload {
  id?: string;
  sectionId: string;
  title: string;
  description?: string | null;
  url: string;
  fileName: string;
  contentType: string;
  published?: boolean;
  sortOrder?: number;
}

export async function upsertDashboardFile(
  accessToken: string,
  input: UpsertDashboardFilePayload,
): Promise<{ file: AdminDashboardFileSummary; message: string }> {
  return adminFetch("admin-upsert-dashboard-file", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteDashboardFile(
  accessToken: string,
  id: string,
): Promise<{ id: string; message: string }> {
  return adminFetch("admin-delete-dashboard-file", accessToken, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function reorderDashboardFiles(
  accessToken: string,
  sectionId: string,
  orderedIds: string[],
): Promise<{ message: string }> {
  return adminFetch("admin-reorder-dashboard-files", accessToken, {
    method: "POST",
    body: JSON.stringify({ sectionId, orderedIds }),
  });
}

export interface AdminPortalTodoSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  actionLabel: string;
  showEmailHint: boolean;
  sortOrder: number;
  published: boolean;
  completedCount: number;
  totalUsers: number;
  completionPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPortalTodoPayload {
  id?: string;
  slug?: string;
  title: string;
  description: string;
  href: string;
  external?: boolean;
  actionLabel: string;
  showEmailHint?: boolean;
  published?: boolean;
  sortOrder?: number;
}

export async function listPortalTodos(
  accessToken: string,
): Promise<{ todos: AdminPortalTodoSummary[]; totalUsers: number }> {
  return adminFetch("admin-list-portal-todos", accessToken, { method: "GET" });
}

export async function upsertPortalTodo(
  accessToken: string,
  input: UpsertPortalTodoPayload,
): Promise<{ todo: AdminPortalTodoSummary; message: string }> {
  return adminFetch("admin-upsert-portal-todo", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deletePortalTodo(
  accessToken: string,
  id: string,
): Promise<{ id: string; message: string }> {
  return adminFetch("admin-delete-portal-todo", accessToken, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function reorderPortalTodos(
  accessToken: string,
  orderedIds: string[],
): Promise<{ message: string }> {
  return adminFetch("admin-reorder-portal-todos", accessToken, {
    method: "POST",
    body: JSON.stringify({ orderedIds }),
  });
}

export interface PortalTodoCompletionUser {
  id: string;
  name: string;
  email: string;
}

export interface PortalTodoCompletionDetail {
  todo: {
    id: string;
    slug: string;
    title: string;
  };
  completed: PortalTodoCompletionUser[];
  pending: PortalTodoCompletionUser[];
  totalUsers: number;
}

export async function getPortalTodoCompletion(
  accessToken: string,
  todoId: string,
): Promise<PortalTodoCompletionDetail> {
  const params = new URLSearchParams({ todoId });
  return adminFetch(`admin-get-portal-todo-completion?${params.toString()}`, accessToken, {
    method: "GET",
  });
}
