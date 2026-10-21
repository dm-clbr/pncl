import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { parsePortalIntegrationRequest, sanitizePortalIntegrationPreview, sanitizePortalIntegrationStatus, sanitizePortalIntegrationSync, sanitizePortalIntegrationError } from '../../supabase/functions/_shared/leadspplyIntegration';

const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const stamp = '2026-10-13T18:00:00+00:00';
const token = 'a'.repeat(64);
const code = '123456789abcdef0123456789abcdef0';
const source = { id: actor, email: 'agent@thepncl.com', personal_email: 'agent@example.com', first_name: 'Agent', last_name: 'One', npn: '00123', agent_number: 12, comp_level: 80, comp_effective_at: stamp, parent_id: null };
const account = { id: target, email: 'agent@example.com', first_name: 'Agent', last_name: 'One', npn: '123', parent_id: null };
const status = { state: 'connected', account: { name: 'Agent One', email: 'agent@example.com', sync_status: 'pending', synced_at: null, pay_tier: null, linked_at: stamp }, pending: true };
const preview = { matches: [{ source, status: 'suggested', reason: 'Email + NPN', candidates: [{ target: account, reasons: ['Email', 'NPN'] }] }], targets: [account], links: [{ pncl_user_id: actor, leadspply_user_id: target, pay_tier: 80, pncl_parent_id: null, sync_status: 'synced', synced_at: stamp }], partners: [], token, revision: 1,
  recentRuns: [{ id: actor, created_at: stamp, revision: 1, linked_count: 1, synced_count: 1, unresolved_count: 0, pncl_actor_id: actor, actor_id: null }],
  events: [{ id: target, created_at: stamp, kind: 'agent_connected', pncl_user_id: actor, leadspply_user_id: target, pncl_actor_id: actor }],
  autoLink: { enabled: false, cadenceMinutes: 15, lastRun: { created_at: stamp, status: 'failed', scanned_count: 4, linked_count: 1, review_count: 2, error_code: 'target_unavailable' } } };
class AuthError extends Error { constructor(message: string, public status: number, public code: string) { super(message); } }
function handler(opts: { adminError?: AuthError; userError?: AuthError; configured?: boolean; payload?: unknown; upstreamStatus?: number; fetchError?: boolean } = {}) {
  let route: (req: Request) => Promise<Response>;
  const requireAdmin = vi.fn(async () => { if (opts.adminError) throw opts.adminError; return { user: { id: actor } }; });
  const requirePortalUser = vi.fn(async () => { if (opts.userError) throw opts.userError; return { user: { id: actor } }; });
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    if (opts.fetchError) throw new Error('fixture secret and code must never escape');
    const action = JSON.parse(String(init.body)).action;
    const payload = opts.payload ?? (action === 'preview' ? preview : action === 'sync' ? { linked: 1, synced: 1, unresolved: 0, revision: 2, partners: 0, unresolved_partners: 0 } : status);
    return new Response(JSON.stringify(payload), { status: opts.upstreamStatus ?? 200 });
  });
  const file = readFileSync('supabase/functions/manage-leadspply-integration/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
  const compiled = ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('Deno', 'AdminAuthError', 'requireAdmin', 'requirePortalUser', 'corsHeaders', 'parsePortalIntegrationRequest', 'sanitizePortalIntegrationPreview', 'sanitizePortalIntegrationStatus', 'sanitizePortalIntegrationSync', 'sanitizePortalIntegrationError', 'fetch', 'AbortSignal', 'console', compiled)(
    { serve: (h: typeof route) => { route = h; }, env: { get: () => opts.configured === false ? undefined : 'server-only-fixture-key' } }, AuthError, requireAdmin, requirePortalUser, { 'Access-Control-Allow-Origin': '*' }, parsePortalIntegrationRequest, sanitizePortalIntegrationPreview, sanitizePortalIntegrationStatus, sanitizePortalIntegrationSync, sanitizePortalIntegrationError, fetcher, { timeout: () => new AbortController().signal }, { error: vi.fn() });
  return { requireAdmin, requirePortalUser, fetcher, request: (body: unknown = { action: 'status' }, method = 'POST', query = '') => route(new Request('https://source/functions/v1/manage-leadspply-integration' + query, { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })) };
}
describe('PNCL integration request boundaries', () => {
  it('allows only explicit supported actions with no caller-selected actors', () => {
    for (const input of [{ action: 'status', pnclUserId: target }, { action: 'preview', sourceActorId: target }, { action: 'redeem', code, leadspplyUserId: target }, { action: 'sync', token, links: [], endpoint: 'https://evil.example' }, { action: 'issue_code' }, null, []]) expect(() => parsePortalIntegrationRequest(input)).toThrow();
  });
  it('accepts pasted code separators but rejects malformed or oversized secrets', () => {
    expect(parsePortalIntegrationRequest({ action: 'redeem', code: '12345678-9ABCDEF0-12345678-9ABCDEF0' })).toEqual({ action: 'redeem', code });
    for (const value of ['', 'a'.repeat(31), 'a'.repeat(81), 'g'.repeat(32), code + '<']) expect(() => parsePortalIntegrationRequest({ action: 'redeem', code: value })).toThrow();
  });
  it('rejects duplicate, oversized and extra-field selections and invalid stale tokens', () => {
    const link = { pncl_user_id: actor, leadspply_user_id: target };
    for (const links of [[link, link], [{ ...link, role: 'admin' }], [{ ...link, leadspply_user_id: 'invalid' }], Array(1001).fill(link)]) expect(() => parsePortalIntegrationRequest({ action: 'sync', token, links })).toThrow();
    expect(() => parsePortalIntegrationRequest({ action: 'sync', token: 'wrong', links: [] })).toThrow();
  });
});
describe('PNCL integration projection', () => {
  it('retains approved matches and monitoring but drops credentials, codes and customer data', () => {
    const projected = sanitizePortalIntegrationPreview({ ...preview, serviceRoleKey: 'private', customerPhones: ['private'], targets: [{ ...account, password: 'private' }], recentRuns: [{ ...preview.recentRuns[0], changes: { private: true } }], events: [{ ...preview.events[0], code_hash: 'private' }] });
    expect(projected).toEqual(preview);
    expect(JSON.stringify(projected)).not.toContain('private');
  });
  it('never exposes another account from unavailable states', () => {
    for (const state of ['not_linked', 'account_unavailable']) expect(sanitizePortalIntegrationStatus({ ...status, state, otherAccount: account })).toEqual({ state, account: null });
  });
  it('fails closed on malformed upstream values', () => {
    for (const payload of [{ ...preview, revision: -1 }, { ...preview, token: 'not-a-token' }, { ...preview, links: [{ ...preview.links[0], pay_tier: 81 }] }, { ...preview, events: [{ ...preview.events[0], pncl_actor_id: null }] }, { ...preview, autoLink: { ...preview.autoLink, cadenceMinutes: 0 } }, { ...preview, autoLink: { ...preview.autoLink, lastRun: { ...preview.autoLink.lastRun, status: 'running' } } }]) expect(() => sanitizePortalIntegrationPreview(payload)).toThrow();
    expect(() => sanitizePortalIntegrationStatus({ ...status, account: { ...status.account, sync_status: 'invented' } })).toThrow();
    expect(() => sanitizePortalIntegrationSync({ linked: 1.5, synced: 1, unresolved: 0, revision: 2 })).toThrow();
  });
});
describe('PNCL integration authenticated proxy', () => {
  it('derives agent identity only from live auth and forwards no browser bearer', async () => {
    const h = handler();
    const response = await h.request({ action: 'redeem', code });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual(status);
    const [url, init] = h.fetcher.mock.calls[0];
    expect(url).toBe('https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-portal');
    expect(init.body).toBe(JSON.stringify({ action: 'redeem', code, pnclUserId: actor }));
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'X-PNCL-Integration-Key': 'server-only-fixture-key' });
    expect(init.redirect).toBe('error');
    expect(h.requireAdmin).not.toHaveBeenCalled();
  });
  it('requires full admin auth for preview and sync and derives its source actor', async () => {
    for (const body of [{ action: 'preview' }, { action: 'sync', token, links: [] }]) {
      const denied = handler({ adminError: new AuthError('Full admin required', 403, 'forbidden') });
      expect((await denied.request(body)).status).toBe(403);
      expect(denied.fetcher).not.toHaveBeenCalled();
      const h = handler(); expect((await h.request(body)).status).toBe(200);
      expect(JSON.parse(String(h.fetcher.mock.calls[0][1].body))).toEqual({ ...body, sourceActorId: actor });
      expect(h.requirePortalUser).not.toHaveBeenCalled();
    }
  });
  it('denies unauthenticated or domain-ineligible agents without upstream access', async () => {
    for (const s of [401, 403]) { const h = handler({ userError: new AuthError('Denied', s, 'denied') }); expect((await h.request()).status).toBe(s); expect(h.fetcher).not.toHaveBeenCalled(); }
  });
  it('rejects mutation parameters, malformed bodies and wrong HTTP methods before upstream access', async () => {
    const h = handler();
    expect((await h.request({ action: 'status', pnclUserId: target })).status).toBe(400);
    expect((await h.request({}, 'GET')).status).toBe(405);
    expect((await h.request({ action: 'status' }, 'POST', '?actor=another')).status).toBe(400);
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('preserves useful stale-preview and code errors without passing through upstream messages', async () => {
    for (const error of ['preview_stale', 'invalid_code', 'identity_review_required', 'account_already_linked']) {
      const h = handler({ upstreamStatus: 409, payload: { error, message: 'private upstream details' } });
      const response = await h.request(); expect(response.status).toBe(409);
      const data = await response.json(); expect(data.error).toBe(error); expect(data.message).not.toContain('private');
    }
  });
  it('hides configuration and unexpected upstream failures with no code or secret leakage', async () => {
    for (const opts of [{ upstreamStatus: 401, payload: { error: 'private secret' } }, { payload: { secret: 'private' } }, { fetchError: true }]) {
      const h = handler(opts); const response = await h.request(); expect(response.status).toBe(502); expect(await response.text()).not.toMatch(/private|server-only|fixture|12345678/);
    }
    const h = handler({ configured: false }); expect((await h.request()).status).toBe(503); expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('preflight has no data access', async () => {
    const h = handler(); expect((await h.request({}, 'OPTIONS')).status).toBe(204); expect(h.fetcher).not.toHaveBeenCalled(); expect(h.requireAdmin).not.toHaveBeenCalled();
  });
});

it('validates the own-account LeadSpply ID while supporting older upstream responses', () => {
  expect(sanitizePortalIntegrationStatus({...status, account: {...status.account, leadspply_user_id: target}}).account).toMatchObject({leadspply_user_id: target});
  expect(sanitizePortalIntegrationStatus(status)).toEqual(status);
  expect(() => sanitizePortalIntegrationStatus({...status, account: {...status.account, leadspply_user_id: 'bad'}})).toThrow();
});
