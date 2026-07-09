import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { DirectDepositRecord } from "./portalDirectDeposit.ts";
import type { PortalW9Record } from "./portalW9.ts";
import { createPortalW9SignedUrl } from "./portalW9Documents.ts";
import { resolveW9PdfPath } from "./portalW9Pdf.ts";
import { DIRECT_DEPOSIT_PDF_BUCKET } from "./portalDirectDeposit.ts";
import {
  createOnboardingContractSignedUrl,
  type OnboardingContractRecord,
} from "./onboardingContract.ts";
import { createPortalIcaSignedUrl, type PortalIcaRecord } from "./portalIca.ts";
import { PORTAL_PROFILE_DOCUMENTS_BUCKET } from "./portalProfileSetup.ts";

export interface AdminUserDocument {
  id: string;
  label: string;
  fileName: string;
  signedAt: string | null;
  downloadUrl: string;
}

const DOCUMENT_LABELS: Record<string, string> = {
  "w9.pdf": "Form W-9",
  "direct-deposit.pdf": "Direct deposit request",
  "ica-signed.pdf": "Independent Contractor Agreement",
};

function labelForFileName(fileName: string): string {
  const normalized = fileName.toLowerCase();
  if (DOCUMENT_LABELS[normalized]) return DOCUMENT_LABELS[normalized];
  return fileName.replace(/[-_]/g, " ").replace(/\.pdf$/i, "");
}

/** Archived files carry a timestamp suffix (e.g. w9-2026-07-01T....pdf). */
function labelForArchivedFileName(fileName: string): string {
  const normalized = fileName.toLowerCase();
  if (normalized.startsWith("w9")) return DOCUMENT_LABELS["w9.pdf"];
  if (normalized.startsWith("direct-deposit")) return DOCUMENT_LABELS["direct-deposit.pdf"];
  if (normalized.startsWith("ica")) return DOCUMENT_LABELS["ica-signed.pdf"];
  return labelForFileName(fileName);
}

async function createSignedDownloadUrl(
  adminClient: SupabaseClient,
  path: string,
): Promise<string> {
  return createPortalW9SignedUrl(adminClient, path);
}

export async function loadAdminUserDocuments(
  adminClient: SupabaseClient,
  userId: string,
  w9Record: PortalW9Record | null,
  directDepositRecord: DirectDepositRecord | null,
): Promise<AdminUserDocument[]> {
  const documents: AdminUserDocument[] = [];
  const seenPaths = new Set<string>();

  if (w9Record) {
    const path = resolveW9PdfPath(w9Record);
    seenPaths.add(path);
    documents.push({
      id: "w9",
      label: DOCUMENT_LABELS["w9.pdf"],
      fileName: "w9.pdf",
      signedAt: w9Record.signed_at,
      downloadUrl: await createSignedDownloadUrl(adminClient, path),
    });
  }

  if (directDepositRecord?.pdf_path) {
    seenPaths.add(directDepositRecord.pdf_path);
    const fileName = directDepositRecord.pdf_path.split("/").pop() ?? "direct-deposit.pdf";
    documents.push({
      id: "direct-deposit",
      label: DOCUMENT_LABELS["direct-deposit.pdf"],
      fileName,
      signedAt: directDepositRecord.signed_at,
      downloadUrl: await createSignedDownloadUrl(adminClient, directDepositRecord.pdf_path),
    });
  }

  const { data: listed, error: listError } = await adminClient.storage
    .from(DIRECT_DEPOSIT_PDF_BUCKET)
    .list(userId, { limit: 100 });

  if (!listError && listed) {
    for (const file of listed) {
      // Entries without an id are folders (e.g. archive/, documents/).
      if (!file.name || !file.id || file.name.endsWith("/")) continue;
      const path = `${userId}/${file.name}`;
      if (seenPaths.has(path)) continue;

      documents.push({
        id: path,
        label: labelForFileName(file.name),
        fileName: file.name,
        signedAt: file.updated_at ?? file.created_at ?? null,
        downloadUrl: await createSignedDownloadUrl(adminClient, path),
      });
    }
  }

  const { data: archivedFiles, error: archiveListError } = await adminClient.storage
    .from(DIRECT_DEPOSIT_PDF_BUCKET)
    .list(`${userId}/archive`, { limit: 100 });

  if (!archiveListError && archivedFiles) {
    for (const file of archivedFiles) {
      if (!file.name || !file.id) continue;
      const path = `${userId}/archive/${file.name}`;

      documents.push({
        id: path,
        label: `${labelForArchivedFileName(file.name)} (archived)`,
        fileName: file.name,
        signedAt: file.created_at ?? file.updated_at ?? null,
        downloadUrl: await createSignedDownloadUrl(adminClient, path),
      });
    }
  }

  return documents.sort((a, b) => a.label.localeCompare(b.label));
}

export async function loadPortalIcaDocument(
  adminClient: SupabaseClient,
  userId: string,
): Promise<AdminUserDocument | null> {
  const { data, error } = await adminClient
    .from("portal_ica_signatures")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const record = data as PortalIcaRecord;
  return {
    id: "ica",
    label: "Independent Contractor Agreement",
    fileName: "ica-signed.pdf",
    signedAt: record.signed_at,
    downloadUrl: await createPortalIcaSignedUrl(adminClient, record.pdf_path),
  };
}

export async function loadOnboardingContractDocument(
  adminClient: SupabaseClient,
  onboardingId: string,
): Promise<AdminUserDocument | null> {
  const { data, error } = await adminClient
    .from("onboarding_contract_signatures")
    .select("*")
    .eq("onboarding_id", onboardingId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const record = data as OnboardingContractRecord;
  return {
    id: "ica",
    label: "Independent Contractor Agreement",
    fileName: "ica-signed.pdf",
    signedAt: record.signed_at,
    downloadUrl: await createOnboardingContractSignedUrl(adminClient, record.pdf_path),
  };
}

interface ManualProfileDocumentRow {
  id: string;
  label: string;
  file_path: string;
  created_at: string;
}

/** Documents the agent uploaded via the "My documents" profile section. */
export async function loadManualProfileDocuments(
  adminClient: SupabaseClient,
  userId: string,
): Promise<AdminUserDocument[]> {
  const { data, error } = await adminClient
    .from("portal_profile_documents")
    .select("id, label, file_path, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const documents: AdminUserDocument[] = [];
  for (const row of data as ManualProfileDocumentRow[]) {
    const { data: signed } = await adminClient.storage
      .from(PORTAL_PROFILE_DOCUMENTS_BUCKET)
      .createSignedUrl(row.file_path, 60 * 60);

    if (!signed?.signedUrl) continue;

    documents.push({
      id: `manual-${row.id}`,
      label: `${row.label} (agent upload)`,
      fileName: row.file_path.split("/").pop() ?? row.label,
      signedAt: row.created_at,
      downloadUrl: signed.signedUrl,
    });
  }

  return documents;
}

export async function loadAdminUserDocumentsWithContract(
  adminClient: SupabaseClient,
  userId: string,
  onboardingId: string | null,
  w9Record: PortalW9Record | null,
  directDepositRecord: DirectDepositRecord | null,
): Promise<AdminUserDocument[]> {
  const [documents, manualDocuments] = await Promise.all([
    loadAdminUserDocuments(adminClient, userId, w9Record, directDepositRecord),
    loadManualProfileDocuments(adminClient, userId),
  ]);
  const withoutIcaDuplicates = [...documents, ...manualDocuments].filter(
    (document) => document.fileName.toLowerCase() !== "ica-signed.pdf",
  );

  const portalIcaDocument = await loadPortalIcaDocument(adminClient, userId);
  if (portalIcaDocument) {
    return [portalIcaDocument, ...withoutIcaDuplicates].sort((a, b) => a.label.localeCompare(b.label));
  }

  if (!onboardingId) {
    return withoutIcaDuplicates.sort((a, b) => a.label.localeCompare(b.label));
  }

  const contractDocument = await loadOnboardingContractDocument(adminClient, onboardingId);
  if (!contractDocument) {
    return withoutIcaDuplicates.sort((a, b) => a.label.localeCompare(b.label));
  }

  return [contractDocument, ...withoutIcaDuplicates].sort((a, b) => a.label.localeCompare(b.label));
}

export function validateAdminUserProfileQuery(url: URL): { userId: string } {
  const userId = url.searchParams.get("userId")?.trim() ?? "";
  if (!userId) {
    throw new Error("userId is required");
  }
  return { userId };
}
