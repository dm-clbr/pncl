import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { buildHierarchyExportCsv } from '../../supabase/functions/_shared/hierarchyExport';
const id = '00000000-0000-4000-8000-000000000001';
const lsId = '10000000-0000-4000-8000-000000000001';
class AuthError extends Error { status = 403; code = 'forbidden'; }
function setup({ deny = false, unavailable = false } = {}) {
  let route: (req: Request) => Promise<Response>;
  const lookup = vi.fn(async () => { if (unavailable) throw new Error('Unable to verify LeadSpply user IDs. Please try again.'); return new Map([[id, lsId]]); });
  const agent = { id, name: 'Test', email: 'test@thepncl.com', agentNumber: 1, npn: '123', compLevel: 70, compLevelEffectiveAt: null, phase: 'sales_ready', referrerId: null, referrerName: null, uplineNetwork: null, emailConfirmed: true, createdAt: '2026-10-21' };
  const deps = {
    serve: (handler: typeof route) => { route = handler; }, AdminAuthError: AuthError,
    requireAdmin: async () => { if (deny) throw new AuthError('Denied'); return {adminClient: {from: () => ({select: async () => ({data: []})})}}; },
    buildAgentSummaries: async () => [agent, {...agent, id: '00000000-0000-4000-8000-000000000002', name: 'Other'}],
    loadCarrierWritingNumbersByUserId: async () => new Map(), loadLeadSpplyUserIds: lookup, buildHierarchyExportCsv,
    corsHeaders: {}, errorResponse: (message: string, status: number) => new Response(JSON.stringify({message}), {status}), handleCors: () => null, logOnboarding: vi.fn(), Deno: {env: {get: () => 'test-key'}},
  };
  const js = ts.transpileModule(readFileSync('supabase/functions/admin-export-agents/index.ts', 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText.replace(/^import .*;\n/gm, '');
  new Function(...Object.keys(deps), js)(...Object.values(deps));
  return {lookup, request: (userIds?: string[]) => route(new Request('https://test/admin-export-agents', userIds ? {method: 'POST', body: JSON.stringify({userIds})} : {}))};
}
describe('admin hierarchy CSV endpoint', () => {
  it('downloads the linked ID and preserves the filtered export scope', async () => {
    const h = setup(); const response = await h.request([id]);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    const csv = await response.text();
    expect(csv).toContain('LeadSpply User ID'); expect(csv).toContain(lsId); expect(csv).not.toContain('Other');
    expect(h.lookup).toHaveBeenCalledWith([id], 'test-key');
  });
  it('denies non-admin exports before looking up IDs', async () => {
    const h = setup({deny: true}); expect((await h.request()).status).toBe(403); expect(h.lookup).not.toHaveBeenCalled();
  });
  it('returns a useful error instead of downloading misleading blank IDs', async () => {
    const response = await setup({unavailable: true}).request();
    expect(response.status).toBe(500); expect(await response.text()).toContain('Unable to verify LeadSpply user IDs');
    expect(response.headers.get('Content-Disposition')).toBeNull();
  });
});
