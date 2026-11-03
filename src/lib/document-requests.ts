import { getSupabaseConfig } from "@/lib/supabase";
import { fetchEditor, isLocalEditor, localEditorMedia } from "./onboarding-editor";
export { EMPTY_DOCUMENT_FILTERS, DOCUMENT_CONSENT, MAX_DOCUMENT_BYTES, validateDocumentSignature } from "../../supabase/functions/_shared/documentRequestRules";
export type { DocumentAudience, DocumentFilters, DocumentDelivery, DocumentRolloutOrder } from "../../supabase/functions/_shared/documentRequestRules";
import type { DocumentAudience, DocumentFilters, DocumentDelivery, DocumentRolloutOrder } from "../../supabase/functions/_shared/documentRequestRules";
export interface DocumentRecipient {
  id: string; name: string; email: string; designation: "loa" | "ibo"; state: string; joined_at: string; ica_signed: boolean;
}
export interface DocumentCampaign {
  id: string; title: string; description: string; created_at: string;
  onboarding_enabled: boolean; onboarding_audience: DocumentAudience; onboarding_pending: boolean;
  delivery_mode: DocumentDelivery; rollout_order: DocumentRolloutOrder; held_count: number; current_count: number;
  recipient_count: number; signed_count: number; email_pending_count: number;
  onboarding_step_id?: string | null; onboarding_asset_id?: string | null; onboarding_flow?: "loa" | "ibo" | null;
  rollout_request_id?: string | null;
}
export interface OnboardingDocumentSource {
  stepId: string; stepSlug: string; title: string; description: string; flow: "loa" | "ibo";
  assetId: string; currentAssetId: string | null; filename: string; kind: string; url: string;
  published: boolean; visible: boolean;
}
export interface DocumentRecipientStatus {
  id: string; user_id: string; name: string; email: string; designation: "loa" | "ibo";
  released_at: string | null; signed_at: string | null; signature_name: string | null; source: string;
  notification_status: string; notification_error: string | null;
}
export interface AgentDocumentRequest {
  id: string; title: string; description: string; assignedAt: string;
  signedAt: string | null; signatureName: string | null; documentHash: string;
}
async function call<T>(token: string, endpoint: string, input: unknown): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${endpoint}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Unable to load document requests.");
  return data;
}
export async function listDocumentCampaigns(token: string) {
  return (await call<{ rows: DocumentCampaign[] }>(token, "admin-document-requests", { action: "list" })).rows;
}
export async function getOnboardingDocumentSource(token: string, stepId: string, flow: string, assetId?: string) {
  if (isLocalEditor()) {
    const data = await fetchEditor(token);
    const row = data.rows.find(row => row.id === stepId);
    if (!row || (flow !== "loa" && flow !== "ibo")) throw new Error("Choose an onboarding document.");
    const currentAssetId = row.flowContent[flow]?.assetId ?? null;
    const media = await localEditorMedia(assetId ?? currentAssetId ?? "");
    if (!media?.assetId) throw new Error("Upload and save the PDF in the local step editor first.");
    return { stepId, stepSlug: row.slug, title: row.title, description: row.description, flow, assetId: media.assetId,
      currentAssetId, filename: media.filename ?? "document.pdf", kind: row.contentType, url: media.url,
      published: row.published, visible: flow === "loa" ? row.showLoa : row.showIbo } satisfies OnboardingDocumentSource;
  }
  return call<OnboardingDocumentSource>(token, "admin-document-requests", { action: "source", stepId, flow, assetId });
}
export async function publishLinkedDocumentRollout(token: string, input: {
  id: string; stepId: string; flow: "loa" | "ibo"; assetId: string; expectedAssetId: string | null;
  filters: DocumentFilters; recipientIds: string[]; deliveryMode: DocumentDelivery; rolloutOrder: DocumentRolloutOrder;
}) {
  if (isLocalEditor()) throw new Error("Local review cannot send signing requests.");
  return call<{ id: string }>(token, "admin-document-requests", { action: "publish_linked", ...input });
}
export async function previewDocumentRecipients(token: string, filters: DocumentFilters) {
  if (isLocalEditor()) return [
    { id: "preview-alex", name: "Alex Morgan", email: "alex@example.invalid", designation: filters.designation === "ibo" ? "ibo" as const : "loa" as const, state: "UT", joined_at: "2026-01-10", ica_signed: true },
    { id: "preview-bailey", name: "Bailey Taylor", email: "bailey@example.invalid", designation: filters.designation === "ibo" ? "ibo" as const : "loa" as const, state: "ID", joined_at: "2026-02-20", ica_signed: false },
  ].filter(row => (!filters.search || `${row.name} ${row.email}`.toLowerCase().includes(filters.search.toLowerCase())) && (!filters.state || row.state === filters.state)
    && (filters.ica === "all" || row.ica_signed === (filters.ica === "signed")) && (!filters.joinedAfter || row.joined_at >= filters.joinedAfter) && (!filters.joinedBefore || row.joined_at <= filters.joinedBefore));
  return (await call<{ recipients: DocumentRecipient[] }>(token, "admin-document-requests", { action: "preview", filters })).recipients;
}
export async function publishDocumentRequest(token: string, input: {
  id: string; title: string; description: string; pdfBase64: string; filters: DocumentFilters;
  recipientIds: string[]; onboardingEnabled: boolean; onboardingAudience: DocumentAudience; deliveryMode: DocumentDelivery; rolloutOrder: DocumentRolloutOrder;
}) {
  return call<{ id: string }>(token, "admin-document-requests", { action: "publish", ...input });
}
export async function documentRequestReport(token: string, id: string) {
  return (await call<{ rows: DocumentRecipientStatus[] }>(token, "admin-document-requests", { action: "report", id })).rows;
}
export async function setDocumentOnboarding(token: string, id: string, enabled: boolean, audience: DocumentAudience) {
  return call(token, "admin-document-requests", { action: "onboarding", id, enabled, audience });
}
export async function releaseDocumentCurrentAgents(token: string, id: string) {
  return call(token, "admin-document-requests", { action: "release_current", id });
}
export async function notifyDocumentRecipients(token: string, id: string) {
  return call<{ sent: number; failed: number; remaining: number }>(token, "admin-document-requests", { action: "notify", id });
}
export async function adminDocumentUrl(token: string, id: string, requestId?: string) {
  return (await call<{ url: string }>(token, "admin-document-requests", { action: "url", id, requestId })).url;
}
export async function listAgentDocumentRequests(token: string) {
  return (await call<{ requests: AgentDocumentRequest[] }>(token, "portal-document-requests", { action: "list" })).requests;
}
export async function agentDocumentUrl(token: string, id: string) {
  return (await call<{ url: string }>(token, "portal-document-requests", { action: "url", id })).url;
}
export async function signAgentDocument(token: string, id: string, signatureName: string, accepted: boolean, documentHash: string, fieldValues?: Record<string, string | boolean>) {
  return call(token, "portal-document-requests", { action: "sign", id, signatureName, accepted, documentHash, fieldValues });
}
export function readDocumentFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the PDF. Please choose it again."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
