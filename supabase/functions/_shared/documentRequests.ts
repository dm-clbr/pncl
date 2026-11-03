import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendDocumentNotifications } from "./documentNotifications.ts";
import { getEmailDomain } from "./onboarding.ts";

export const DOCUMENT_BUCKET = "portal-signing-documents";
export interface DocumentCampaign {
  id: string; title: string; description: string; pdf_path: string; pdf_sha256: string;
  created_by: string; created_at: string; onboarding_enabled: boolean;
  onboarding_audience: "all" | "loa" | "ibo"; onboarding_since: string; delivery_mode: "email" | "portal" | "both";
}
export interface DocumentRequest {
  id: string; campaign_id: string; user_id: string; assigned_at: string; released_at: string | null; source: "rollout" | "onboarding";
  signed_at: string | null; signature_name: string | null; signed_pdf_path: string | null;
  notification_status: string; notification_sent_at: string | null; notification_error: string | null;
  campaign: DocumentCampaign;
}
export async function documentUrl(client: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await client.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("Unable to open the document. Please retry.");
  return data.signedUrl;
}
export async function ensureOnboardingDocuments(client: SupabaseClient, userId: string) {
  const { error } = await client.rpc("ensure_onboarding_document_requests", { p_user: userId, p_domain: getEmailDomain() });
  if (error) throw new Error(error.message);
}
export async function listUserDocumentRequests(client: SupabaseClient, userId: string): Promise<DocumentRequest[]> {
  await ensureOnboardingDocuments(client, userId);
  const rows: DocumentRequest[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("portal_document_requests")
      .select("*, campaign:portal_document_campaigns(*)").eq("user_id", userId).not("released_at", "is", null)
      .order("assigned_at", { ascending: false }).order("id").range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []) as unknown as DocumentRequest[]);
    if ((data?.length ?? 0) < 500) break;
  }
  // Future-agent assignments are created on their first authenticated visit.
  // Drain their email outbox in the edge runtime without delaying the portal.
  if (rows.some(row => !row.signed_at && ["queued", "failed", "sending"].includes(row.notification_status))) {
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (work: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime) runtime.waitUntil(sendDocumentNotifications(client, { userId, retry: false }).catch(error => console.error("Document email delivery failed", error instanceof Error ? error.message : "Unknown error")));
  }
  return rows;
}
export async function documentRequestTodos(client: SupabaseClient, userId: string) {
  return (await listUserDocumentRequests(client, userId)).map(row => ({
    id: `document_request_${row.id}`, title: row.campaign.title,
    description: row.campaign.description || "Review this document and sign with your full legal first and last name.",
    href: `/portal/documents?request=${row.id}`, external: false, actionLabel: row.signed_at ? "View signed document" : "Review & sign",
    phase: "on_board" as const, completionType: "auto" as const, completed: !!row.signed_at,
    notifyOnLogin: row.campaign.delivery_mode !== "email", showEmailHint: false, showLoa: true, showIbo: true, prerequisites: [] as string[], supportingFiles: [],
  }));
}
