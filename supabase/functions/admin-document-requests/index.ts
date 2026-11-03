import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { documentAudience, documentFilters, documentId, documentDelivery, documentRolloutOrder } from "../_shared/documentRequestRules.ts";
import { DOCUMENT_BUCKET, documentUrl } from "../_shared/documentRequests.ts";
import { getEmailDomain } from "../_shared/onboarding.ts";
import { sendDocumentNotifications } from "../_shared/documentNotifications.ts";
import { onboardingDocumentSource } from "../_shared/onboardingDocumentLibrary.ts";

serve(async req => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { user, adminClient: client } = await requireAdmin(req);
    const body = await req.json();
    if (body.action === "source") return jsonResponse(await onboardingDocumentSource(client, body));
    if (body.action === "publish_linked") {
      const source = await onboardingDocumentSource(client, body);
      const filters = documentFilters(body.filters);
      if (filters.designation !== source.flow) throw new Error("Recipients must match the document flow.");
      if (!Array.isArray(body.recipientIds) || body.recipientIds.length > 20000) throw new Error("Review the recipient list before sending.");
      const { data, error } = await client.rpc("publish_onboarding_document_rollout", {
        p_request: documentId(body.id), p_admin: user.id, p_step: source.stepId, p_flow: source.flow,
        p_asset: source.assetId, p_expected_asset: body.expectedAssetId === null ? null : documentId(body.expectedAssetId),
        p_filters: filters, p_recipients: [...new Set(body.recipientIds.map(documentId))],
        p_delivery: documentDelivery(body.deliveryMode), p_order: documentRolloutOrder(body.rolloutOrder), p_domain: getEmailDomain(),
      });
      if (error) throw error;
      return jsonResponse({ id: data });
    }
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
      return errorResponse("Add the signing PDF to an onboarding step, then request signatures from that document.", 400);
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
      let bucket = DOCUMENT_BUCKET;
      if (body.requestId) {
        const { data, error } = await client.from("portal_document_requests").select("signed_pdf_path, campaign:portal_document_campaigns(pdf_path,source_bucket)").eq("id", documentId(body.requestId)).eq("campaign_id", documentId(body.id)).single();
        if (error) throw error;
        const campaign = data.campaign as unknown as { pdf_path: string; source_bucket: string };
        path = data.signed_pdf_path ?? campaign.pdf_path;
        if (!data.signed_pdf_path) bucket = campaign.source_bucket;
      } else {
        const { data, error } = await client.from("portal_document_campaigns").select("pdf_path,source_bucket").eq("id", documentId(body.id)).single();
        if (error) throw error;
        path = data.pdf_path;
        bucket = data.source_bucket;
      }
      return jsonResponse({ url: await documentUrl(client, path, bucket) });
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
