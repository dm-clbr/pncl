import legacyHandler from "./legacy.ts";
import { uploadedSigningEnabled } from "../_shared/signingRollout.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { loadPortalSigningSource } from "../_shared/onboardingContent.ts";
import { validateIcaLegalName, normalizeIcaLegalName } from "../_shared/icaSigningRules.ts";
import { signDocumentPdf } from "../_shared/documentSigningPdf.ts";
import { COMP_ATTACHMENT_BUCKET, createCompAttachmentSignedUrl, mapCompAttachmentSummary, type CompAttachmentRecord } from "../_shared/portalCompAttachments.ts";

serve(async req => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { user, adminClient } = await requirePortalUser(req);
    if (!await uploadedSigningEnabled(adminClient, user.id)) return legacyHandler(req);
    const body = await req.clone().json();
    if (typeof body.attachmentId === "string") {
      const { data: legacy, error: legacyError } = await adminClient.from("portal_comp_attachments").select("id").eq("id", body.attachmentId).eq("user_id", user.id).is("template_asset_id", null).eq("status", "pending").maybeSingle();
      if (legacyError) throw new Error(legacyError.message);
      if (legacy) return legacyHandler(req);
    }
    const name = typeof body.signatureName === "string" ? normalizeIcaLegalName(body.signatureName) : "";
    const error = validateIcaLegalName(name); if (error) throw new Error(error);
    if (body.agreementAccepted !== true) throw new Error("Confirm you reviewed and accept the uploaded compensation agreement.");
    const source = await loadPortalSigningSource(adminClient, user.id, "comp_agreement", body.templateAssetId ?? null);
    const { data: signed, error: lookupError } = await adminClient.from("portal_comp_attachments").select("id").eq("user_id", user.id).eq("status", "signed").limit(1);
    if (lookupError) throw new Error(lookupError.message);
    if (signed?.length) return errorResponse("Your compensation agreement is already signed.", 409);
    const id = crypto.randomUUID();
    const signedAt = new Date().toISOString();
    const path = `${user.id}/comp-attachments/${id}-signed.pdf`;
    const bytes = await signDocumentPdf(source.bytes, { fieldValues: body.fieldValues, title: "Compensation agreement", name, signedAt, requestId: source.asset.id, hash: source.sha256, userId: user.id });
    const { error: uploadError } = await adminClient.storage.from(COMP_ATTACHMENT_BUCKET).upload(path, bytes, { upsert: false, contentType: "application/pdf" });
    if (uploadError) throw new Error(uploadError.message);
    const { data: record, error: saveError } = await adminClient.from("portal_comp_attachments").insert({
      id, user_id: user.id, title: "Compensation agreement", unsigned_pdf_path: source.asset.path,
      signed_pdf_path: path, status: "signed", signature_name: name, signed_at: signedAt,
      agent_designation: source.designation, template_asset_id: source.asset.id, template_sha256: source.sha256,
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, user_agent: req.headers.get("user-agent"),
    }).select("*").single();
    if (saveError || !record) throw new Error(saveError?.message ?? "Unable to save your signature. Reload to check its status.");
    return jsonResponse({ attachment: { ...mapCompAttachmentSummary(record as CompAttachmentRecord), documentUrl: await createCompAttachmentSignedUrl(adminClient, path) }, message: "Compensation agreement signed." });
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    return errorResponse(error instanceof Error ? error.message : "Unable to sign compensation agreement.", 400);
  }
});
