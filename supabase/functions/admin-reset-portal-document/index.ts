import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { getCompletedTodosFromMetadata } from "../_shared/portalTodos.ts";
import { logOnboarding } from "../_shared/logger.ts";
import type { PortalW9Record } from "../_shared/portalW9.ts";
import { resolveW9PdfPath } from "../_shared/portalW9Pdf.ts";
import { PORTAL_PROFILE_DOCUMENTS_BUCKET } from "../_shared/portalW9Documents.ts";
import {
  DIRECT_DEPOSIT_TODO_SLUG,
  getDirectDepositPdfPath,
  type DirectDepositRecord,
} from "../_shared/portalDirectDeposit.ts";
import { ICA_TODO_SLUG, type PortalIcaRecord } from "../_shared/portalIca.ts";
import {
  ONBOARDING_CONTRACT_BUCKET,
  type OnboardingContractRecord,
} from "../_shared/onboardingContract.ts";

export type ResetDocumentType = "w9" | "direct_deposit" | "ica";

const DOCUMENT_CONFIG: Record<ResetDocumentType, {
  todoSlug: string;
  resignFlag: string;
  archivePrefix: string;
  label: string;
}> = {
  w9: {
    todoSlug: "w9_setup",
    resignFlag: "w9_resign_required",
    archivePrefix: "w9",
    label: "W-9",
  },
  direct_deposit: {
    todoSlug: DIRECT_DEPOSIT_TODO_SLUG,
    resignFlag: "direct_deposit_resign_required",
    archivePrefix: "direct-deposit",
    label: "direct deposit form",
  },
  ica: {
    todoSlug: ICA_TODO_SLUG,
    resignFlag: "ica_resign_required",
    archivePrefix: "ica",
    label: "Independent Contractor Agreement",
  },
};

interface ResetDocumentPayload {
  userId: string;
  documentType: ResetDocumentType;
}

function validatePayload(body: unknown): ResetDocumentPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!userId) throw new Error("userId is required");

  const documentType = typeof data.documentType === "string" ? data.documentType : "";
  if (!(documentType in DOCUMENT_CONFIG)) {
    throw new Error("documentType must be one of: w9, direct_deposit, ica");
  }

  return { userId, documentType: documentType as ResetDocumentType };
}

function buildArchivePath(userId: string, prefix: string, signedAt: string | null): string {
  const stampSource = signedAt ? new Date(signedAt) : new Date();
  const stamp = Number.isNaN(stampSource.getTime()) ? new Date() : stampSource;
  const label = stamp.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  return `${userId}/archive/${prefix}-${label}.pdf`;
}

/**
 * Downloads a PDF from any bucket and re-uploads it under the user's archive
 * folder in the profile-documents bucket, then removes the original. Returns
 * the archive path, or null when the source PDF is missing (a missing PDF
 * shouldn't block the reset — the form row is the source of truth).
 */
async function archivePdf(
  adminClient: SupabaseClient,
  sourceBucket: string,
  sourcePath: string,
  archivePath: string,
): Promise<string | null> {
  const { data: fileData, error: downloadError } = await adminClient.storage
    .from(sourceBucket)
    .download(sourcePath);

  if (downloadError || !fileData) {
    logOnboarding("admin_reset_portal_document_archive_skipped", {
      bucket: sourceBucket,
      path: sourcePath,
      error: downloadError?.message ?? "empty file",
    }, "warn");
    return null;
  }

  const { error: uploadError } = await adminClient.storage
    .from(PORTAL_PROFILE_DOCUMENTS_BUCKET)
    .upload(archivePath, await fileData.arrayBuffer(), {
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    throw new Error(`Unable to archive PDF: ${uploadError.message}`);
  }

  const { error: removeError } = await adminClient.storage
    .from(sourceBucket)
    .remove([sourcePath]);

  if (removeError) {
    throw new Error(`PDF was archived but the active copy could not be removed: ${removeError.message}`);
  }

  return archivePath;
}

interface ResetOutcome {
  found: boolean;
  archivedPaths: string[];
  previousSignedAt: string | null;
  previousSignatureName: string | null;
}

async function resetW9(adminClient: SupabaseClient, userId: string): Promise<ResetOutcome> {
  const { data, error } = await adminClient
    .from("portal_w9_forms")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { found: false, archivedPaths: [], previousSignedAt: null, previousSignatureName: null };

  const record = data as PortalW9Record;
  const archived = await archivePdf(
    adminClient,
    PORTAL_PROFILE_DOCUMENTS_BUCKET,
    resolveW9PdfPath(record),
    buildArchivePath(userId, "w9", record.signed_at),
  );

  const { error: deleteError } = await adminClient
    .from("portal_w9_forms")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  return {
    found: true,
    archivedPaths: archived ? [archived] : [],
    previousSignedAt: record.signed_at,
    previousSignatureName: record.signature_name,
  };
}

async function resetDirectDeposit(adminClient: SupabaseClient, userId: string): Promise<ResetOutcome> {
  const { data, error } = await adminClient
    .from("portal_direct_deposit_forms")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { found: false, archivedPaths: [], previousSignedAt: null, previousSignatureName: null };

  const record = data as DirectDepositRecord;
  const archived = await archivePdf(
    adminClient,
    PORTAL_PROFILE_DOCUMENTS_BUCKET,
    record.pdf_path?.trim() || getDirectDepositPdfPath(userId),
    buildArchivePath(userId, "direct-deposit", record.signed_at),
  );

  const { error: deleteError } = await adminClient
    .from("portal_direct_deposit_forms")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  return {
    found: true,
    archivedPaths: archived ? [archived] : [],
    previousSignedAt: record.signed_at,
    previousSignatureName: record.signature_name,
  };
}

/**
 * An ICA signature can exist in the portal table, the legacy onboarding
 * contract table, or both. Both must be cleared or the todo auto-completes
 * again from the remaining row.
 */
async function resetIca(adminClient: SupabaseClient, userId: string): Promise<ResetOutcome> {
  const archivedPaths: string[] = [];
  let found = false;
  let previousSignedAt: string | null = null;
  let previousSignatureName: string | null = null;

  const { data: portalRow, error: portalError } = await adminClient
    .from("portal_ica_signatures")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (portalError) throw new Error(portalError.message);

  if (portalRow) {
    found = true;
    const record = portalRow as PortalIcaRecord;
    previousSignedAt = record.signed_at;
    previousSignatureName = record.signature_name;

    const archived = await archivePdf(
      adminClient,
      PORTAL_PROFILE_DOCUMENTS_BUCKET,
      record.pdf_path,
      buildArchivePath(userId, "ica", record.signed_at),
    );
    if (archived) archivedPaths.push(archived);

    const { error: deleteError } = await adminClient
      .from("portal_ica_signatures")
      .delete()
      .eq("user_id", userId);
    if (deleteError) throw new Error(deleteError.message);
  }

  const { data: onboardingRow, error: onboardingError } = await adminClient
    .from("onboarding_records")
    .select("id")
    .eq("supabase_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (onboardingError) throw new Error(onboardingError.message);

  if (onboardingRow?.id) {
    const { data: contractRow, error: contractError } = await adminClient
      .from("onboarding_contract_signatures")
      .select("*")
      .eq("onboarding_id", onboardingRow.id)
      .maybeSingle();

    if (contractError) throw new Error(contractError.message);

    if (contractRow) {
      found = true;
      const contract = contractRow as OnboardingContractRecord;
      previousSignedAt = previousSignedAt ?? contract.signed_at;
      previousSignatureName = previousSignatureName ?? contract.signature_name;

      const archived = await archivePdf(
        adminClient,
        ONBOARDING_CONTRACT_BUCKET,
        contract.pdf_path,
        buildArchivePath(userId, "ica-onboarding", contract.signed_at),
      );
      if (archived) archivedPaths.push(archived);

      const { error: deleteError } = await adminClient
        .from("onboarding_contract_signatures")
        .delete()
        .eq("id", contract.id);
      if (deleteError) throw new Error(deleteError.message);
    }
  }

  return { found, archivedPaths, previousSignedAt, previousSignatureName };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const payload = validatePayload(await req.json());
    const config = DOCUMENT_CONFIG[payload.documentType];

    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(
      payload.userId,
    );

    if (userError || !userData.user) {
      return errorResponse("User not found", 404, "user_not_found");
    }

    let outcome: ResetOutcome;
    if (payload.documentType === "w9") {
      outcome = await resetW9(adminClient, payload.userId);
    } else if (payload.documentType === "direct_deposit") {
      outcome = await resetDirectDeposit(adminClient, payload.userId);
    } else {
      outcome = await resetIca(adminClient, payload.userId);
    }

    if (!outcome.found) {
      return errorResponse(
        `This user has no ${config.label} on file.`,
        404,
        "document_not_found",
      );
    }

    const completed = getCompletedTodosFromMetadata(
      userData.user.user_metadata as Record<string, unknown> | undefined,
    );
    delete completed[config.todoSlug];

    const { error: metadataError } = await adminClient.auth.admin.updateUserById(payload.userId, {
      user_metadata: {
        ...userData.user.user_metadata,
        completed_portal_todos: completed,
        // Shows the re-submit banner on the portal dashboard until the user
        // signs a new copy (cleared by the matching submit function).
        [config.resignFlag]: true,
      },
    });

    if (metadataError) {
      throw new Error(metadataError.message);
    }

    const { error: auditError } = await adminClient
      .from("admin_audit_log")
      .insert({
        admin_user_id: adminUser.id,
        target_user_id: payload.userId,
        action: `${payload.documentType}_reset`,
        changes: {
          archivedPaths: outcome.archivedPaths,
          previousSignedAt: outcome.previousSignedAt,
          previousSignatureName: outcome.previousSignatureName,
        },
      });

    if (auditError) {
      logOnboarding("admin_audit_log_write_failed", {
        userId: payload.userId,
        error: auditError.message,
      }, "warn");
    }

    logOnboarding("admin_reset_portal_document", {
      adminId: adminUser.id,
      userId: payload.userId,
      documentType: payload.documentType,
      archivedPaths: outcome.archivedPaths,
    });

    return jsonResponse({
      userId: payload.userId,
      documentType: payload.documentType,
      archivedPaths: outcome.archivedPaths,
      message: outcome.archivedPaths.length > 0
        ? `${config.label.charAt(0).toUpperCase() + config.label.slice(1)} archived. The agent will be asked to complete it again.`
        : `${config.label.charAt(0).toUpperCase() + config.label.slice(1)} reset. The agent will be asked to complete it again.`,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to reset document";
    logOnboarding("admin_reset_portal_document_failed", { error: message }, "error");
    return errorResponse(message, 500, "reset_failed");
  }
});
