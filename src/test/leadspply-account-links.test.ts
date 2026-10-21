import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadLeadSpplyUserIds, LINK_LOOKUP_ERROR } from '../../supabase/functions/_shared/leadspplyAccountLinks';
beforeAll(() => vi.stubGlobal('AbortSignal', { timeout: () => new AbortController().signal }));
afterAll(() => vi.unstubAllGlobals());
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const response = (links: unknown) => new Response(JSON.stringify({ links }));

describe('authoritative LeadSpply IDs', () => {
  it('requests only selected PNCL IDs and never infers an unlinked account', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([{ pncl_user_id: id(1), leadspply_user_id: id(101) }]));
    const result = await loadLeadSpplyUserIds([id(1), id(2), id(1)], 'test-key', fetcher);
    expect([...result]).toEqual([[id(1), id(101)]]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-portal');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', body: JSON.stringify({ action: 'links', pnclUserIds: [id(1), id(2)] }), headers: { 'X-PNCL-Integration-Key': 'test-key' } });
  });
  it('batches large exports below the API row limit', async () => {
    const fetcher = vi.fn().mockImplementation(async (_url, init) => response(JSON.parse(init.body).pnclUserIds.map((pncl_user_id: string) => ({ pncl_user_id, leadspply_user_id: pncl_user_id.replace('00000000-', '10000000-') }))));
    const result = await loadLeadSpplyUserIds(Array.from({length: 1002}, (_, i) => id(i)), 'test-key', fetcher);
    expect(result.size).toBe(1002);
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init.body).pnclUserIds.length)).toEqual([500, 500, 2]);
  });
  it('fails the lookup on malformed, duplicate or unrelated returned identities', async () => {
    for (const links of [null, [{ pncl_user_id: id(1), leadspply_user_id: 'bad' }], [{ pncl_user_id: id(3), leadspply_user_id: id(101) }], [1, 1].map(n => ({ pncl_user_id: id(n), leadspply_user_id: id(101) })), [1, 2].map(n => ({ pncl_user_id: id(n), leadspply_user_id: id(101) }))]) {
      await expect(loadLeadSpplyUserIds([id(1), id(2)], 'test-key', vi.fn().mockResolvedValue(response(links)))).rejects.toThrow(LINK_LOOKUP_ERROR);
    }
  });
  it('does not silently export blanks on upstream failure or missing configuration', async () => {
    for (const fetcher of [vi.fn().mockRejectedValue(new Error('private upstream details')), vi.fn().mockResolvedValue(new Response('private upstream details', {status: 503})), vi.fn().mockResolvedValue(new Response('not JSON'))]) {
      await expect(loadLeadSpplyUserIds([id(1)], 'test-key', fetcher)).rejects.toThrow(LINK_LOOKUP_ERROR);
    }
    const fetcher = vi.fn();
    await expect(loadLeadSpplyUserIds([id(1)], undefined, fetcher)).rejects.toThrow(LINK_LOOKUP_ERROR);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await loadLeadSpplyUserIds([], undefined, fetcher)).toEqual(new Map());
  });
});
