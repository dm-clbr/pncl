import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface SignedIcaDocumentRequest {
  id: string;
  user_id: string;
  signed_at: string;
  signature_name: string;
  signed_pdf_path: string;
  campaign: { onboarding_asset_id: string | null; onboarding_step: { slug: string } };
}

/** Saved ICA requests count only when signed after the user's latest ICA reset. */
export async function loadSignedIcaDocumentRequests(
  client: SupabaseClient,
  userIds: string[],
): Promise<Map<string, SignedIcaDocumentRequest>> {
  const signed = new Map<string, SignedIcaDocumentRequest>();
  if (!userIds.length) return signed;

  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("portal_document_requests")
      .select("id, user_id, signed_at, signature_name, signed_pdf_path, campaign:portal_document_campaigns!inner(onboarding_asset_id, onboarding_step:portal_todos!inner(slug))")
      .in("user_id", userIds)
      .eq("campaign.onboarding_step.slug", "ica_setup")
      .not("released_at", "is", null)
      .not("signed_at", "is", null)
      .not("signed_pdf_path", "is", null)
      .order("signed_at", { ascending: false }).order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Unable to verify signed ICA requests. Please retry.");
    const rows = (data ?? []) as unknown as SignedIcaDocumentRequest[];
    for (const row of rows) {
      if (row.campaign?.onboarding_step?.slug !== "ica_setup" || !row.signature_name?.trim() ||
        !row.signed_pdf_path?.trim() || !Number.isFinite(Date.parse(row.signed_at))) continue;
      if (!signed.has(row.user_id)) signed.set(row.user_id, row);
    }
    if (rows.length < 500) break;
  }
  if (!signed.size) return signed;

  // Checking the server-written reset history prevents an old rollout PDF from
  // undoing a later admin reset. No user-editable completion flag grants credit.
  const candidateIds = [...signed.keys()];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("admin_audit_log")
      .select("id, target_user_id, created_at")
      .eq("action", "ica_reset").in("target_user_id", candidateIds)
      .order("created_at", { ascending: false }).order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Unable to verify ICA reset history. Please retry.");
    for (const reset of data ?? []) {
      const request = signed.get(reset.target_user_id);
      if (request && Date.parse(reset.created_at) >= Date.parse(request.signed_at)) signed.delete(reset.target_user_id);
    }
    if ((data?.length ?? 0) < 500) break;
  }
  return signed;
}
