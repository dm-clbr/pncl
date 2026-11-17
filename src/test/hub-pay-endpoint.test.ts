import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  email: 'agent@thepncl.com',
  issue: vi.fn(async () => ({ url: 'synthetic-link', expiresAt: 'synthetic-expiry' })),
  fetch: vi.fn(),
}));
vi.mock('../../supabase/functions/_shared/adminAuth.ts', () => ({
  AdminAuthError: class extends Error {},
  requirePortalUser: async () => ({
    user: { id: '11111111-1111-4111-8111-111111111111' },
    adminClient: { auth: { admin: { getUserById: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }) } } },
  }),
}));
vi.mock('../../supabase/functions/_shared/hubWorkEmail.ts', () => ({ requireHubWorkEmail: async () => fakes.email }));
vi.mock('../../supabase/functions/_shared/pnclPay.ts', () => ({
  issuePayLink: fakes.issue, payAccessEnabled: () => true, PAY_REDEEM_PATH: '/api/auth/partner/redeem', retryAfterSeconds: () => 60,
}));
const id = '22222222-2222-4222-8222-222222222222';
let handler: (req: Request) => Promise<Response>;
const status = (accountId = id) => ({ state: 'connected', email: fakes.email, account: { id: accountId, email: fakes.email }, ownershipVerified: true, proofExpiresAt: null, emailMatches: true, approved: true, ready: true });
const request = (body: unknown) => handler(new Request('https://example.test/functions/v1/portal-leadspply-setup', { method: 'POST', body: JSON.stringify(body) }));
beforeAll(async () => {
  vi.stubGlobal('AbortSignal', { timeout: () => new AbortController().signal });
  vi.stubGlobal('Deno', { serve: (fn: typeof handler) => { handler = fn; }, env: { get: (name: string) => name === 'PNCL_HUB_SETUP_ENABLED' ? 'true' : 'synthetic-test-value' } });
  vi.stubGlobal('fetch', fakes.fetch);
  await import('../../supabase/functions/portal-leadspply-setup/index');
});
beforeEach(() => {
  vi.clearAllMocks();
  fakes.fetch.mockImplementation(async () => new Response(JSON.stringify(status()), { status: 200 }));
});
afterAll(() => vi.unstubAllGlobals());

it('checks the source account on the server and strips the guard from the legacy upstream contract', async () => {
  const response = await request({ action: 'pay', expectedAccountId: id });
  expect(response.status).toBe(200);
  expect(fakes.issue).toHaveBeenCalledOnce();
  expect(JSON.parse(fakes.fetch.mock.calls[0][1].body)).toEqual({ action: 'pay', pnclUserId: '11111111-1111-4111-8111-111111111111', pnclEmail: fakes.email });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('refuses a mismatched account before Pay signing', async () => {
  fakes.fetch.mockResolvedValueOnce(new Response(JSON.stringify(status('33333333-3333-4333-8333-333333333333'))));
  const response = await request({ action: 'pay', expectedAccountId: id });
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe('pay_account_mismatch');
  expect(fakes.issue).not.toHaveBeenCalled();
});
it('does not let a matching ID bypass existing readiness checks', async () => {
  fakes.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ...status(), approved: false, ready: false })));
  const response = await request({ action: 'pay', expectedAccountId: id });
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe('setup_incomplete');
  expect(fakes.issue).not.toHaveBeenCalled();
});
it('continues to accept the existing Hub Pay request without a source ID', async () => {
  expect((await request({ action: 'pay' })).status).toBe(200);
  expect(fakes.issue).toHaveBeenCalledOnce();
});
