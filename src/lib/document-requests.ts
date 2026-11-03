import { getSupabaseConfig } from "@/lib/supabase";
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
export async function previewDocumentRecipients(token: string, filters: DocumentFilters) {
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
