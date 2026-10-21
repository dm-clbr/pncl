const ENDPOINT = 'https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-portal';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LINK_LOOKUP_ERROR = 'Unable to verify LeadSpply user IDs. Please try again.';

/** Read the authoritative links, including pending links, without running a sync. */
export async function loadLeadSpplyUserIds(
  pnclUserIds: string[],
  key: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const ids = [...new Set(pnclUserIds.map(id => id.toLowerCase()))];
  const links = new Map<string, string>();
  if (!ids.length) return links;
  if (!key || ids.some(id => !UUID.test(id))) throw new Error(LINK_LOOKUP_ERROR);
  const targets = new Set<string>();
  try {
    // Stay below the Data API row limit, and only request exported/profile users.
    for (let start = 0; start < ids.length; start += 500) {
      const batch = ids.slice(start, start + 500);
      const response = await fetcher(ENDPOINT, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', 'X-PNCL-Integration-Key': key },
        body: JSON.stringify({ action: 'links', pnclUserIds: batch }),
      });
      if (!response.ok) throw new Error(LINK_LOOKUP_ERROR);
      const payload = await response.json();
      if (!Array.isArray(payload?.links) || payload.links.length > batch.length) throw new Error(LINK_LOOKUP_ERROR);
      for (const row of payload.links) {
        if (typeof row?.pncl_user_id !== 'string' || typeof row?.leadspply_user_id !== 'string'
          || !UUID.test(row.pncl_user_id) || !UUID.test(row.leadspply_user_id)) throw new Error(LINK_LOOKUP_ERROR);
        const source = row.pncl_user_id.toLowerCase();
        const target = row.leadspply_user_id.toLowerCase();
        if (!batch.includes(source) || links.has(source) || targets.has(target)) throw new Error(LINK_LOOKUP_ERROR);
        links.set(source, target);
        targets.add(target);
      }
    }
    return links;
  } catch {
    // Never expose upstream response bodies, credentials, or transport errors.
    throw new Error(LINK_LOOKUP_ERROR);
  }
}
