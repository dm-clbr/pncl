import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { DIRECT_DEPOSIT_PDF_BUCKET } from "./portalDirectDeposit.ts";
import type { PortalW9Record } from "./portalW9.ts";
import { generatePortalW9PdfFromRecord, getW9PdfPath } from "./portalW9Pdf.ts";
import { decryptTemporaryPassword } from "./security.ts";

export const PORTAL_PROFILE_DOCUMENTS_BUCKET = DIRECT_DEPOSIT_PDF_BUCKET;

export async function ensureW9Pdf(
  adminClient: SupabaseClient,
  record: PortalW9Record,
  callerModuleUrl?: string,
): Promise<string> {
  const path = record.pdf_path?.trim() || getW9PdfPath(record.user_id);
  const tin = await decryptTemporaryPassword(record.tin_encrypted);
  const pdfBytes = await generatePortalW9PdfFromRecord(record, tin, callerModuleUrl);

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
