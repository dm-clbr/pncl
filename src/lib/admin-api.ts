import { getSupabaseConfig } from "@/lib/supabase";
import type { PortalRole } from "@/lib/roles";

export type GenesisAccountStatus = "pending" | "created" | "skipped";

export type GoogleWorkspaceStatus = "active" | "suspended" | "auto_suspended" | "not_found";

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

export type AgentPhase = "on_board" | "pre_license" | "licensing" | "sales_ready" | "complete";

export const AGENT_PHASE_LABELS: Record<AgentPhase, string> = {
  on_board: "On-Board",
  pre_license: "Pre-License",
  licensing: "Licensing",
  sales_ready: "Sales Ready",
  complete: "Complete",
};

export const AGENT_PHASE_ORDER: AgentPhase[] = [
  "on_board",
  "pre_license",
  "licensing",
  "sales_ready",
  "complete",
];

/** Formats a numeric agent number as the display ID, e.g. PNCL-00042. */
export function formatAgentNumber(agentNumber: number | null | undefined): string | null {
  if (agentNumber === null || agentNumber === undefined) return null;
  return `PNCL-${String(agentNumber).padStart(5, "0")}`;
}

export interface AgentSummary {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  compLevel: number | null;
  npn: string | null;
  agentNumber: number | null;
  phase: AgentPhase | null;
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
  hasOnboardingRecord: boolean;
  onboardingId: string | null;
  personalEmail: string | null;
  gmailVerificationEmailSentAt: string | null;
  googleWorkspaceStatus: GoogleWorkspaceStatus | null;
  googleSuspensionReason: string | null;
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
  compLevel?: number;
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

/** Downloads the agent roster CSV and triggers a browser save. */
export async function downloadAgentsCsv(accessToken: string): Promise<void> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/admin-export-agents`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });

  if (!response.ok) {
    let message = "Unable to export agents";
    try {
      const data = await response.json();
      if (typeof data.message === "string") message = data.message;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `pncl-agents-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
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

export async function updateUserCompLevel(
  accessToken: string,
  userId: string,
  compLevel: number | null,
): Promise<{ userId: string; compLevel: number | null; message: string }> {
  return adminFetch("admin-update-comp-level", accessToken, {
    method: "POST",
    body: JSON.stringify({ userId, compLevel }),
  });
}

export async function updateUserReferrer(
  accessToken: string,
  userId: string,
  referrerUserId: string | null,
): Promise<{
  userId: string;
  referrerUserId: string | null;
  uplineNetwork: string;
  message: string;
}> {
  return adminFetch("admin-update-referrer", accessToken, {
    method: "POST",
    body: JSON.stringify({ userId, referrerUserId }),
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

export async function sendTestGenesisNotification(
  accessToken: string,
): Promise<{ recipients: string[]; message: string }> {
  return adminFetch("admin-test-genesis-notification", accessToken, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export interface NotifySuspendedGmailResult {
  onboardingId: string;
  workspaceEmail: string;
  personalEmail: string;
  status: "sent" | "skipped" | "error";
  reason?: string;
  suspensionReason?: string | null;
}

export interface NotifySuspendedGmailSummary {
  dryRun: boolean;
  scanned: number;
  sent: number;
  skipped: number;
  errors: number;
  message: string;
  results: NotifySuspendedGmailResult[];
}

export async function notifySuspendedGmailUsers(
  accessToken: string,
  payload: { dryRun?: boolean; forceResend?: boolean; limit?: number } = {},
): Promise<NotifySuspendedGmailSummary> {
  return adminFetch("admin-notify-suspended-gmail", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface GoogleRecoveryBackfillResult {
  onboardingId: string;
  workspaceEmail: string;
  personalEmail: string;
  recoveryPhone: string | null;
  status: "updated" | "skipped" | "error";
  reason?: string;
}

export interface GoogleRecoveryBackfillSummary {
  dryRun: boolean;
  scanned: number;
  updated: number;
  skipped: number;
  errors: number;
  hasMore?: boolean;
  nextOffset?: number;
  message: string;
  results: GoogleRecoveryBackfillResult[];
}

export async function backfillGoogleRecovery(
  accessToken: string,
  payload: {
    dryRun?: boolean;
    limit?: number;
    offset?: number;
    onboardingId?: string;
    userId?: string;
  } = {},
): Promise<GoogleRecoveryBackfillSummary> {
  return adminFetch("admin-backfill-google-recovery", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

const RECOVERY_BACKFILL_BATCH_SIZE = 10;

export async function reactivateGoogleUser(
  accessToken: string,
  payload: { onboardingId?: string; userId?: string },
): Promise<{ workspaceEmail: string; wasSuspended: boolean; message: string }> {
  return adminFetch("admin-reactivate-google-user", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function backfillGoogleRecoveryAll(
  accessToken: string,
  payload: { dryRun?: boolean; batchSize?: number } = {},
): Promise<GoogleRecoveryBackfillSummary> {
  const batchSize = payload.batchSize ?? RECOVERY_BACKFILL_BATCH_SIZE;
  let offset = 0;
  let hasMore = true;
  const totals = {
    dryRun: payload.dryRun ?? false,
    scanned: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    results: [] as GoogleRecoveryBackfillResult[],
  };

  while (hasMore) {
    const batch = await backfillGoogleRecovery(accessToken, {
      dryRun: payload.dryRun,
      limit: batchSize,
      offset,
    });

    totals.scanned += batch.scanned;
    totals.updated += batch.updated;
    totals.skipped += batch.skipped;
    totals.errors += batch.errors;
    totals.results.push(...batch.results);
    hasMore = Boolean(batch.hasMore);
    offset = batch.nextOffset ?? offset + batchSize;

    if (batch.scanned === 0) {
      break;
    }
  }

  const wouldUpdateCount = totals.results.filter((result) => result.reason === "dry_run").length;

  return {
    ...totals,
    hasMore: false,
    nextOffset: offset,
    message: totals.dryRun
      ? `Dry run complete. ${wouldUpdateCount} Google account${wouldUpdateCount === 1 ? "" : "s"} would receive updated recovery info.`
      : `Updated Google recovery info for ${totals.updated} account${totals.updated === 1 ? "" : "s"}.`,
  };
}

export interface GmailVerificationCandidate {
  onboardingId: string;
  legalName: string;
  firstName: string;
  workspaceEmail: string;
  personalEmail: string;
  phoneNumber: string;
  status: string;
  gmailVerificationEmailSentAt: string | null;
  supabaseUserId: string | null;
  createdAt: string;
  googleWorkspaceStatus: GoogleWorkspaceStatus | null;
  googleSuspensionReason: string | null;
}

export async function listGmailVerificationCandidates(
  accessToken: string,
): Promise<{ candidates: GmailVerificationCandidate[] }> {
  return adminFetch("admin-list-gmail-verification-candidates", accessToken, {
    method: "GET",
  });
}

export async function sendGmailVerificationEmail(
  accessToken: string,
  payload: { onboardingId?: string; userId?: string; forceResend?: boolean },
): Promise<NotifySuspendedGmailResult & { message: string }> {
  return adminFetch("admin-send-gmail-verification", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
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

export type AdminPortalTodoPhase = "on_board" | "pre_license" | "licensing" | "sales_ready";
export type AdminPortalTodoCompletionType = "auto" | "agent" | "admin";

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
  phase: AdminPortalTodoPhase;
  completionType: AdminPortalTodoCompletionType;
  autoKey: string | null;
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
  phase: AdminPortalTodoPhase;
  completionType: AdminPortalTodoCompletionType;
  autoKey: string | null;
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

export interface AdminUserDocument {
  id: string;
  label: string;
  fileName: string;
  signedAt: string | null;
  downloadUrl: string;
}

export interface AdminUserPortalProfile {
  firstName: string;
  lastName: string;
  shirtSize: string | null;
  poloShirtSize: string | null;
  hoodieSize: string | null;
  waistSize: string | null;
  shoeSize: string | null;
  profilePhotoUrl: string | null;
  npn: string | null;
  eoPolicyNumber: string | null;
  eoCertificateUrl: string | null;
  stateLicenses: string[];
  driversLicenseUrl: string | null;
  addressLine1: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  county: string | null;
  updatedAt: string;
}

export interface AdminUserTodoStatus {
  slug: string;
  title: string;
  description: string;
  phase: AdminPortalTodoPhase;
  completionType: AdminPortalTodoCompletionType;
  autoKey: string | null;
  completed: boolean;
  manuallyCompleted: boolean;
}

export interface AdminUserW9Summary {
  userId: string;
  legalName: string;
  businessName: string | null;
  taxClassification: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  tinType: "ssn" | "ein";
  signatureName: string;
  signedAt: string;
}

export interface AdminUserDirectDepositSummary {
  userId: string;
  legalName: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  accountType: "checking" | "savings";
  signatureName: string;
  signedAt: string;
  pdfPath: string;
}

export interface AdminUserGoogleWorkspaceSummary {
  status: GoogleWorkspaceStatus | "unknown";
  suspensionReason: string | null;
  recoveryEmail: string | null;
  recoveryPhone: string | null;
  mobilePhone: string | null;
  lastLoginTime: string | null;
  loadError: string | null;
}

export interface AdminUserCarrierStatus {
  carrierId: string;
  carrier: string;
  applicationSubmittedAt: string | null;
  hasCredentials: boolean;
  writingNumber: string | null;
}

export interface AdminUserProfileDetail {
  agent: AgentSummary;
  googleWorkspace: AdminUserGoogleWorkspaceSummary | null;
  portalProfile: AdminUserPortalProfile | null;
  w9: AdminUserW9Summary | null;
  directDeposit: AdminUserDirectDepositSummary | null;
  completedPortalTodos: Record<string, boolean>;
  todos: AdminUserTodoStatus[];
  documents: AdminUserDocument[];
  carrierStatuses: AdminUserCarrierStatus[];
}

export interface AdminEditableProfileFields {
  firstName?: string | null;
  lastName?: string | null;
  shirtSize?: string | null;
  poloShirtSize?: string | null;
  hoodieSize?: string | null;
  waistSize?: string | null;
  shoeSize?: string | null;
  addressLine1?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  county?: string | null;
  npn?: string | null;
  eoPolicyNumber?: string | null;
  stateLicenses?: string[];
}

/** Admin correction of an agent's portal profile; changes are audit-logged server-side. */
export async function updateUserProfileFields(
  accessToken: string,
  input: { userId: string; fields: AdminEditableProfileFields },
): Promise<{ message: string }> {
  return adminFetch("admin-update-user-profile", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setCarrierApplicationStatus(
  accessToken: string,
  input: { userId: string; carrierId: string; submitted: boolean },
): Promise<{ message: string }> {
  return adminFetch("admin-set-carrier-status", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
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

export async function getAdminUserProfile(
  accessToken: string,
  userId: string,
): Promise<AdminUserProfileDetail> {
  const params = new URLSearchParams({ userId });
  return adminFetch(`admin-get-user-profile?${params.toString()}`, accessToken, {
    method: "GET",
  });
}

export async function setUserTodoCompletion(
  accessToken: string,
  input: { userId: string; slug: string; completed: boolean },
): Promise<{ message: string }> {
  return adminFetch("admin-set-user-todo-completion", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type AdminCompAttachmentStatus = "none" | "pending" | "signed";

export interface AdminContractingRow {
  userId: string;
  name: string;
  email: string;
  npn: string | null;
  eoPolicyNumber: string | null;
  hasEoCertificate: boolean;
  licensingReady: boolean;
  licensingCompletedAt: string | null;
  contractingInitiatedAt: string | null;
  icaSigned: boolean;
  icaSignedAt: string | null;
  compStatus: AdminCompAttachmentStatus;
  compTitle: string | null;
  compAssignedAt: string | null;
  compSignedAt: string | null;
}

export interface AdminCompAttachment {
  id: string;
  userId: string;
  title: string;
  status: "pending" | "signed";
  assignedAt: string;
  signatureName: string | null;
  signedAt: string | null;
  unsignedUrl: string | null;
  signedUrl: string | null;
}

export interface AdminLeadChargeUploadRow {
  email?: string;
  name?: string;
  agentNumber?: number;
  description?: string;
  amountCents: number;
}

export interface AdminLeadCharge {
  id: string;
  weekOf: string;
  userId: string | null;
  portalName: string | null;
  portalEmail: string | null;
  agentEmail: string | null;
  agentName: string | null;
  description: string | null;
  amountCents: number;
  sourceFile: string | null;
}

export async function uploadLeadCharges(
  accessToken: string,
  input: { weekOf: string; sourceFile: string | null; rows: AdminLeadChargeUploadRow[] },
): Promise<{ message: string; matched: number; unmatched: number }> {
  return adminFetch("admin-upload-lead-charges", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listLeadCharges(
  accessToken: string,
  weekOf?: string,
): Promise<{ weeks: string[]; weekOf: string | null; charges: AdminLeadCharge[] }> {
  const query = weekOf ? `?weekOf=${encodeURIComponent(weekOf)}` : "";
  return adminFetch(`admin-list-lead-charges${query}`, accessToken, { method: "GET" });
}

export type AdminTicketType = "hierarchy_change" | "pay_tier" | "commission_dispute" | "other";
export type AdminTicketStatus = "open" | "in_progress" | "resolved";

export interface AdminTicket {
  id: string;
  userId: string;
  type: AdminTicketType;
  subject: string;
  description: string;
  status: AdminTicketStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  agentName: string;
  agentEmail: string | null;
}

export interface AdminTicketAssignee {
  id: string;
  name: string;
  email: string;
}

export async function listAdminTickets(
  accessToken: string,
): Promise<{ tickets: AdminTicket[]; admins: AdminTicketAssignee[] }> {
  return adminFetch("admin-list-tickets", accessToken, { method: "GET" });
}

export async function updateAdminTicket(
  accessToken: string,
  input: {
    ticketId: string;
    status?: AdminTicketStatus;
    assignedTo?: string | null;
    resolution?: string | null;
  },
): Promise<{ message: string }> {
  return adminFetch("admin-update-ticket", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface AdminPayPolicyEntry {
  id: string;
  title: string;
  body: string;
  category: "policy" | "faq";
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export async function listAdminPayPolicyEntries(
  accessToken: string,
): Promise<AdminPayPolicyEntry[]> {
  const data = await adminFetch<{ entries: AdminPayPolicyEntry[] }>(
    "admin-list-pay-policy",
    accessToken,
    { method: "GET" },
  );
  return data.entries;
}

export async function upsertPayPolicyEntry(
  accessToken: string,
  input: {
    id?: string;
    title: string;
    body: string;
    category: "policy" | "faq";
    sortOrder: number;
    published: boolean;
  },
): Promise<{ message: string }> {
  return adminFetch("admin-upsert-pay-policy-entry", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deletePayPolicyEntry(
  accessToken: string,
  id: string,
): Promise<{ message: string }> {
  return adminFetch("admin-delete-pay-policy-entry", accessToken, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function listContractingQueue(accessToken: string): Promise<AdminContractingRow[]> {
  const data = await adminFetch<{ rows: AdminContractingRow[] }>(
    "admin-list-contracting",
    accessToken,
    { method: "GET" },
  );
  return data.rows;
}

export async function markContractingInitiated(
  accessToken: string,
  input: { userId: string; initiated: boolean },
): Promise<{ message: string }> {
  return adminFetch("admin-mark-contracting-initiated", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function assignCompAttachment(
  accessToken: string,
  input: { userId: string; title: string; pdfBase64: string },
): Promise<{ message: string }> {
  return adminFetch("admin-assign-comp-attachment", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listCompAttachments(
  accessToken: string,
  userId?: string,
): Promise<AdminCompAttachment[]> {
  const params = new URLSearchParams();
  if (userId) params.set("userId", userId);
  const query = params.toString();
  const data = await adminFetch<{ attachments: AdminCompAttachment[] }>(
    `admin-list-comp-attachments${query ? `?${query}` : ""}`,
    accessToken,
    { method: "GET" },
  );
  return data.attachments;
}

export async function deleteCompAttachment(
  accessToken: string,
  attachmentId: string,
): Promise<{ message: string }> {
  return adminFetch("admin-delete-comp-attachment", accessToken, {
    method: "POST",
    body: JSON.stringify({ attachmentId }),
  });
}
