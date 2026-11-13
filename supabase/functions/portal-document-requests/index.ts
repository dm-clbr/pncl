import { validateSignatureAdoption, signaturePngBytes, SIGNATURE_ADOPTION_CONSENT } from "../_shared/signatureAdoption.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { sha256, signDocumentPdf } from "../_shared/documentSigningPdf.ts";
import { DOCUMENT_CONSENT, documentId, validateDocumentSignature } from "../_shared/documentRequestRules.ts";
import { DOCUMENT_BUCKET, documentUrl, listUserDocumentRequests, type DocumentRequest } from "../_shared/documentRequests.ts";

serve(async req => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { user, adminClient: client } = await requirePortalUser(req);
    const body = await req.json();
    if (body.action === "list") {
      const rows = await listUserDocumentRequests(client, user.id);
      return jsonResponse({ requests: rows.map(row => ({
        id: row.id, title: row.campaign.title, description: row.campaign.description,
        assignedAt: row.assigned_at, signedAt: row.signed_at, signatureName: row.signature_name,
        documentHash: row.campaign.pdf_sha256,
      })) });
    }
    const { data, error } = await client.from("portal_document_requests").select("*, campaign:portal_document_campaigns(*)")
      .eq("id", documentId(body.id)).eq("user_id", user.id).not("released_at", "is", null).maybeSingle();
    if (error) throw error;
    if (!data) return errorResponse("Document request not found", 404);
    const row = data as unknown as DocumentRequest;
    if (body.action === "url") return jsonResponse({ url: await documentUrl(client, row.signed_pdf_path ?? row.campaign.pdf_path, row.signed_pdf_path ? DOCUMENT_BUCKET : row.campaign.source_bucket ?? DOCUMENT_BUCKET) });
    if (body.action !== "sign") return errorResponse("Unknown document action", 400);
    if (row.signed_at) return jsonResponse({ ok: true });
    const name = validateDocumentSignature(body.signatureName, body.accepted);
    const signatureAdoption = validateSignatureAdoption(body.signatureAdoption, name);
    signaturePngBytes(body.signatureImageBase64);
    if (body.documentHash !== row.campaign.pdf_sha256) throw new Error("Reload and review the current document before signing.");
    const { data: file, error: downloadError } = await client.storage.from(row.campaign.source_bucket ?? DOCUMENT_BUCKET).download(row.campaign.pdf_path);
    if (downloadError || !file) throw new Error("Unable to load the document. Please retry.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (await sha256(bytes) !== row.campaign.pdf_sha256) throw new Error("The document has changed. Contact PNCL support.");
    const signedAt = new Date().toISOString();
    const signed = await signDocumentPdf(bytes, { signatureAdoption, signatureImageBase64: body.signatureImageBase64, fieldValues: body.fieldValues, title: row.campaign.title, name, signedAt, requestId: row.id, userId: user.id, hash: row.campaign.pdf_sha256 });
    const path = `signatures/${user.id}/${row.id}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await client.storage.from(DOCUMENT_BUCKET).upload(path, signed, { upsert: false, contentType: "application/pdf" });
    if (uploadError) throw uploadError;
    const { data: saved, error: saveError } = await client.from("portal_document_requests").update({
      signed_at: signedAt, signature_name: name, signed_pdf_path: path, consent_text: `${DOCUMENT_CONSENT} ${SIGNATURE_ADOPTION_CONSENT} Method: ${signatureAdoption.method}; version: ${signatureAdoption.version}.`,
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 100) ?? null,
      user_agent: req.headers.get("user-agent")?.slice(0, 1000) ?? null,
    }).eq("id", row.id).eq("user_id", user.id).is("signed_at", null).select("id").maybeSingle();
    if (saveError) throw saveError;
    if (!saved) await client.storage.from(DOCUMENT_BUCKET).remove([path]); // Another successful signature won the race.
    return jsonResponse({ ok: true });
  } catch (err) {
    if (err instanceof AdminAuthError) return errorResponse(err.message, err.status, err.code);
    return errorResponse(err instanceof Error ? err.message : "Unable to complete the document request. Please retry.", 400);
  }
});
