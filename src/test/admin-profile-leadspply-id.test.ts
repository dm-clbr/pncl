import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { isFullAdminRole } from '../../supabase/functions/_shared/adminRoles';
const id = '00000000-0000-4000-8000-000000000001';
const lsId = '10000000-0000-4000-8000-000000000001';
class AuthError extends Error { status = 403; code = 'forbidden'; }
function setup(role = 'admin', lookupError = false, linked = true) {
  let route: (req: Request) => Promise<Response>;
  const lookup = vi.fn(async () => { if (lookupError) throw new Error('private'); return new Map(linked ? [[id, lsId]] : []); });
  const from = () => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'limit']) query[method] = () => query;
    query.maybeSingle = async () => ({data: null});
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({data: [], error: null}).then(resolve);
    return query;
  };
  const deps = {
    serve: (handler: typeof route) => { route = handler; }, AdminAuthError: AuthError,
    requireGenesisAdminOrAdmin: async () => { if (role === 'agent') throw new AuthError('Denied'); return {user: {role}, adminClient: {from, auth: {admin: {getUserById: async () => ({data: {user: {user_metadata: {}}}})}}}}; },
    getUserRole: (user: {role: string}) => user.role, isFullAdminRole,
    loadLeadSpplyUserIds: lookup, LINK_LOOKUP_ERROR: 'Unable to verify LeadSpply user IDs. Please try again.',
    buildAgentSummaryForUser: async () => ({id, name: 'Test', email: ''}),
    getWorkspaceUser: vi.fn(), resolveGoogleWorkspaceStatus: vi.fn(),
    loadAdminUserDocumentsWithContract: async () => [], validateAdminUserProfileQuery: () => ({userId: id}),
    mapDirectDepositSummary: vi.fn(), mapPortalW9Summary: vi.fn(), computeAutoCompletionSets: async () => new Map(),
    getCompletedTodosFromMetadata: () => ({}), isTodoCompleteForUser: vi.fn(), PORTAL_PROFILE_DOCUMENTS_BUCKET: 'private',
    errorResponse: (message: string, status: number) => new Response(JSON.stringify({message}), {status}),
    handleCors: () => null, jsonResponse: (data: unknown) => new Response(JSON.stringify(data)), logOnboarding: vi.fn(),
    filterAgentTodos: () => [], resolveAgentDesignation: () => 'loa', loadAgentDesignations: async () => new Map(),
    Deno: {env: {get: () => 'test-key'}},
  };
  const js = ts.transpileModule(readFileSync('supabase/functions/admin-get-user-profile/index.ts', 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText.replace(/^import .*;\n/gm, '');
  new Function(...Object.keys(deps), js)(...Object.values(deps));
  return {lookup, request: () => route(new Request(`https://test/profile?userId=${id}`))};
}
describe('admin profile identity', () => {
  it('returns the confirmed ID for the requested profile', async () => {
    const h = setup(); const result = await h.request();
    expect(result.status).toBe(200); expect((await result.json()).leadspply).toEqual({userId: lsId, error: null});
    expect(h.lookup).toHaveBeenCalledWith([id], 'test-key');
  });
  it('preserves the rest of the profile on lookup failure, distinct from not linked', async () => {
    const result = await setup('admin', true).request();
    expect(result.status).toBe(200); const data = await result.json();
    expect(data.agent.id).toBe(id); expect(data.leadspply).toEqual({userId: null, error: 'Unable to verify LeadSpply user IDs. Please try again.'});
    expect((await (await setup('admin', false, false).request()).json()).leadspply).toEqual({userId: null, error: null});
  });
  it('never fetches or returns the cross-product ID to Genesis admins or agents', async () => {
    const genesis = setup('genesis_admin');
    expect(await (await genesis.request()).json()).not.toHaveProperty('leadspply'); expect(genesis.lookup).not.toHaveBeenCalled();
    const agent = setup('agent'); expect((await agent.request()).status).toBe(403); expect(agent.lookup).not.toHaveBeenCalled();
  });
});
