import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { documentAudience, documentFilters, documentId, documentDelivery, documentRolloutOrder } from "../_shared/documentRequestRules.ts";
import { DOCUMENT_BUCKET, documentUrl } from "../_shared/documentRequests.ts";
import { decodeSigningPdf, sha256 } from "../_shared/documentSigningPdf.ts";
import { getEmailDomain } from "../_shared/onboarding.ts";
import { sendDocumentNotifications } from "../_shared/documentNotifications.ts";

serve(async req => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { user, adminClient: client } = await requireAdmin(req);
    const body = await req.json();
    if (body.action === "list" || body.action === "report") {
      const { data, error } = await client.rpc("document_request_report", { p_campaign: body.action === "report" ? documentId(body.id) : null });
      if (error) throw error;
      return jsonResponse({ rows: data });
    }
    if (body.action === "preview") {
      const filters = documentFilters(body.filters);
      const { data, error } = await client.rpc("document_request_recipients", { p_filters: filters, p_domain: getEmailDomain() });
      if (error) throw error;
      return jsonResponse({ recipients: data });
    }
    if (body.action === "publish") {
      const id = documentId(body.id);
      const { data: existing, error: existingError } = await client.from("portal_document_campaigns").select("id, created_by").eq("id", id).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        if (existing.created_by !== user.id) throw new Error("Document ID already in use.");
        return jsonResponse({ id: existing.id });
      }
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (!title || title.length > 160 || description.length > 2000) throw new Error("Enter a title up to 160 characters and instructions up to 2,000 characters.");
      const filters = documentFilters(body.filters);
      const audience = documentAudience(body.onboardingAudience);
      if (typeof body.onboardingEnabled !== "boolean") throw new Error("Choose an onboarding setting.");
      const delivery = documentDelivery(body.deliveryMode);
      const order = documentRolloutOrder(body.rolloutOrder);
      if (!Array.isArray(body.recipientIds) || body.recipientIds.length > 20000) throw new Error("Review the recipient list before sending (maximum 20,000 per rollout).");
      const recipients = [...new Set(body.recipientIds.map(documentId))];
      if (!recipients.length && !body.onboardingEnabled) throw new Error("Select at least one agent or enable future onboarding.");
      const bytes = await decodeSigningPdf(body.pdfBase64);
      const hash = await sha256(bytes);
      // A unique upload per attempt prevents concurrent retries overwriting the source PDF.
      const path = `editions/${id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await client.storage.from(DOCUMENT_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
      const { data, error } = await client.rpc("publish_document_request", {
        p_id: id, p_admin: user.id, p_title: title, p_description: description, p_path: path, p_hash: hash,
        p_filters: filters, p_recipients: recipients, p_onboarding: body.onboardingEnabled,
        p_audience: audience, p_delivery: delivery, p_order: order, p_domain: getEmailDomain(),
      });
      // A network error can mean the transaction committed. Only remove a redundant
      // upload after positively verifying which immutable path the database retained.
      const { data: saved } = await client.from("portal_document_campaigns").select("pdf_path").eq("id", id).maybeSingle();
      if (saved && saved.pdf_path !== path) await client.storage.from(DOCUMENT_BUCKET).remove([path]);
      if (error) throw error;
      return jsonResponse({ id: data });
    }
    if (body.action === "release_current") {
      const { error } = await client.rpc("release_document_current_agents", { p_id: documentId(body.id), p_admin: user.id });
      if (error) throw error;
      return jsonResponse({ ok: true });
    }
    if (body.action === "onboarding") {
      if (typeof body.enabled !== "boolean") throw new Error("Choose an onboarding setting.");
      const { error } = await client.rpc("set_document_onboarding", {
        p_id: documentId(body.id), p_admin: user.id, p_enabled: body.enabled, p_audience: documentAudience(body.audience),
      });
      if (error) throw error;
      return jsonResponse({ ok: true });
    }
    if (body.action === "url") {
      let path: string;
      if (body.requestId) {
        const { data, error } = await client.from("portal_document_requests").select("signed_pdf_path, campaign:portal_document_campaigns(pdf_path)").eq("id", documentId(body.requestId)).single();
        if (error) throw error;
        path = data.signed_pdf_path ?? (data.campaign as unknown as { pdf_path: string }).pdf_path;
      } else {
        const { data, error } = await client.from("portal_document_campaigns").select("pdf_path").eq("id", documentId(body.id)).single();
        if (error) throw error;
        path = data.pdf_path;
      }
      return jsonResponse({ url: await documentUrl(client, path) });
    }
    if (body.action === "notify") {
      const id = documentId(body.id);
      const { sent, failed } = await sendDocumentNotifications(client, { campaignId: id });
      const { count, error: countError } = await client.from("portal_document_requests").select("id", { count: "exact", head: true }).eq("campaign_id", id).not("released_at", "is", null).is("signed_at", null).in("notification_status", ["queued", "failed", "sending"]);
      if (countError) throw countError;
      return jsonResponse({ sent, failed, remaining: count ?? 0 });
    }
    return errorResponse("Unknown document action", 400);
  } catch (err) {
    if (err instanceof AdminAuthError) return errorResponse(err.message, err.status, err.code);
    return errorResponse(err instanceof Error ? err.message : "Unable to update document requests. Please retry.", 400);
  }
});
