import type { DebitCheckInitials, SubmitOnboardingContractPayload } from "./onboardingContract.ts";
import {
  createOnboardingContractSignedUrl,
  type OnboardingContractRecord,
} from "./onboardingContract.ts";
import { DIRECT_DEPOSIT_PDF_BUCKET } from "./portalDirectDeposit.ts";
import { createPortalW9SignedUrl } from "./portalW9Documents.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const PORTAL_ICA_PDF_BUCKET = DIRECT_DEPOSIT_PDF_BUCKET;
export const ICA_TODO_SLUG = "ica_setup";

export type IcaSignatureSource = "portal" | "onboarding";

export interface PortalIcaRecord {
  user_id: string;
  legal_name: string;
  personal_email: string;
  signature_name: string;
  ica_version: string;
  debit_check_initials: DebitCheckInitials;
  agreement_accepted: boolean;
  counsel_acknowledged: boolean;
  signed_at: string;
  pdf_path: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalIcaSummary {
  userId: string;
  legalName: string;
  personalEmail: string;
  signatureName: string;
  icaVersion: string;
  signedAt: string;
  pdfPath: string;
}

export function getPortalIcaPdfPath(userId: string): string {
  return `${userId}/ica-signed.pdf`;
}

export function mapPortalIcaSummary(record: PortalIcaRecord): PortalIcaSummary {
  return {
    userId: record.user_id,
    legalName: record.legal_name,
    personalEmail: record.personal_email,
    signatureName: record.signature_name,
    icaVersion: record.ica_version,
    signedAt: record.signed_at,
    pdfPath: record.pdf_path,
  };
}

export async function createPortalIcaSignedUrl(
  adminClient: SupabaseClient,
  pdfPath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  return createPortalW9SignedUrl(adminClient, pdfPath, expiresInSeconds);
}

export type SubmitPortalIcaPayload = SubmitOnboardingContractPayload;

export interface ResolvedIcaStatus {
  signed: boolean;
  source: IcaSignatureSource | null;
  ica: PortalIcaSummary | null;
}

function mapOnboardingContractToPortalSummary(
  userId: string,
  record: OnboardingContractRecord,
): PortalIcaSummary {
  return {
    userId,
    legalName: record.legal_name,
    personalEmail: record.personal_email,
    signatureName: record.signature_name,
    icaVersion: record.ica_version,
    signedAt: record.signed_at,
    pdfPath: record.pdf_path,
  };
}

export async function resolveUserIcaStatus(
  adminClient: SupabaseClient,
  userId: string,
): Promise<ResolvedIcaStatus> {
  const { data: portalRow, error: portalError } = await adminClient
    .from("portal_ica_signatures")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (portalError) {
    throw new Error(portalError.message);
  }

  if (portalRow) {
    const record = portalRow as PortalIcaRecord;
    return {
      signed: true,
      source: "portal",
      ica: mapPortalIcaSummary(record),
    };
  }

  const { data: onboardingRow, error: onboardingError } = await adminClient
    .from("onboarding_records")
    .select("id")
    .eq("supabase_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (onboardingError) {
    throw new Error(onboardingError.message);
  }

  if (!onboardingRow?.id) {
    return { signed: false, source: null, ica: null };
  }

  const { data: contractRow, error: contractError } = await adminClient
    .from("onboarding_contract_signatures")
    .select("*")
    .eq("onboarding_id", onboardingRow.id)
    .maybeSingle();

  if (contractError) {
    throw new Error(contractError.message);
  }

  if (!contractRow) {
    return { signed: false, source: null, ica: null };
  }

  const contract = contractRow as OnboardingContractRecord;
  return {
    signed: true,
    source: "onboarding",
    ica: mapOnboardingContractToPortalSummary(userId, contract),
  };
}

export async function createIcaDownloadUrl(
  adminClient: SupabaseClient,
  status: ResolvedIcaStatus,
): Promise<string | null> {
  if (!status.signed || !status.ica) {
    return null;
  }

  if (status.source === "portal") {
    return createPortalIcaSignedUrl(adminClient, status.ica.pdfPath);
  }

  return createOnboardingContractSignedUrl(adminClient, status.ica.pdfPath);
}

/** User IDs with a portal ICA or an onboarding-linked contract signature. */
export async function listIcaSignedUserIds(
  adminClient: SupabaseClient,
  userIds: string[],
): Promise<Set<string>> {
  const signed = new Set<string>();
  if (userIds.length === 0) {
    return signed;
  }

  const { data: portalRows, error: portalError } = await adminClient
    .from("portal_ica_signatures")
    .select("user_id")
    .in("user_id", userIds);

  if (portalError) {
    throw new Error(portalError.message);
  }

  for (const row of portalRows ?? []) {
    if (row.user_id) signed.add(row.user_id);
  }

  const remaining = userIds.filter((id) => !signed.has(id));
  if (remaining.length === 0) {
    return signed;
  }

  const { data: onboardingRows, error: onboardingError } = await adminClient
    .from("onboarding_records")
    .select("id, supabase_user_id")
    .in("supabase_user_id", remaining);

  if (onboardingError) {
    throw new Error(onboardingError.message);
  }

  const onboardingIds = (onboardingRows ?? [])
    .map((row) => row.id)
    .filter((id): id is string => Boolean(id));

  if (onboardingIds.length === 0) {
    return signed;
  }

  const userByOnboardingId = new Map<string, string>();
  for (const row of onboardingRows ?? []) {
    if (row.id && row.supabase_user_id) {
      userByOnboardingId.set(row.id, row.supabase_user_id);
    }
  }

  const { data: contractRows, error: contractError } = await adminClient
    .from("onboarding_contract_signatures")
    .select("onboarding_id")
    .in("onboarding_id", onboardingIds);

  if (contractError) {
    throw new Error(contractError.message);
  }

  for (const row of contractRows ?? []) {
    const userId = row.onboarding_id ? userByOnboardingId.get(row.onboarding_id) : undefined;
    if (userId) signed.add(userId);
  }

  return signed;
}

export function isIcaSignedForUser(
  userId: string,
  metadata: Record<string, unknown> | undefined,
  icaSignedUserIds: Set<string>,
): boolean {
  if (icaSignedUserIds.has(userId)) {
    return true;
  }

  const completed = metadata?.completed_portal_todos;
  if (!completed || typeof completed !== "object" || Array.isArray(completed)) {
    return false;
  }

  return (completed as Record<string, boolean>)[ICA_TODO_SLUG] === true;
}
