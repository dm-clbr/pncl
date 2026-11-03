import { downloadIcaAsset } from "./onboardingContent.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { DIRECT_DEPOSIT_PDF_BUCKET } from "./portalDirectDeposit.ts";
import type { PortalW9Record } from "./portalW9.ts";
import { generatePortalW9PdfFromRecord, resolveW9PdfPath } from "./portalW9Pdf.ts";
import { decryptTemporaryPassword } from "./security.ts";
import { generatePortalW9PdfFromRecord as generateLegacyW9Pdf } from "./legacySigning/portalW9Pdf.ts";

export const PORTAL_PROFILE_DOCUMENTS_BUCKET = DIRECT_DEPOSIT_PDF_BUCKET;

/** Regenerate and upload a W-9 PDF from stored form data (backfill / repair only). */
export async function ensureW9Pdf(
  adminClient: SupabaseClient,
  record: PortalW9Record,
  callerModuleUrl?: string,
): Promise<string> {
  const path = resolveW9PdfPath(record);
  const tin = await decryptTemporaryPassword(record.tin_encrypted);
  let pdfBytes: Uint8Array;
  if (!record.template_asset_id) pdfBytes = await generateLegacyW9Pdf(record, tin, callerModuleUrl);
  else {
    const { data: asset, error } = await adminClient.from("onboarding_content_assets").select("*").eq("id", record.template_asset_id).eq("kind", "w9").single();
    if (error || !asset) throw new Error("The original uploaded W-9 source is unavailable. The signed document cannot be regenerated from a different template.");
    const template = await downloadIcaAsset(adminClient, asset);
    pdfBytes = await generatePortalW9PdfFromRecord(record, tin, callerModuleUrl, template);
  }

  const { error: uploadError } = await adminClient.storage
    .from(PORTAL_PROFILE_DOCUMENTS_BUCKET)
    .upload(path, pdfBytes, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  if (!record.pdf_path?.trim() || record.pdf_path !== path) {
    const { error: updateError } = await adminClient
      .from("portal_w9_forms")
      .update({ pdf_path: path, updated_at: new Date().toISOString() })
      .eq("user_id", record.user_id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return path;
}

export async function createPortalW9SignedUrl(
  adminClient: SupabaseClient,
  pdfPath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await adminClient.storage
    .from(PORTAL_PROFILE_DOCUMENTS_BUCKET)
    .createSignedUrl(pdfPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create W-9 download link");
  }

  return data.signedUrl;
}

export async function createW9DownloadUrl(
  adminClient: SupabaseClient,
  record: PortalW9Record,
): Promise<string> {
  return createPortalW9SignedUrl(adminClient, resolveW9PdfPath(record));
}
