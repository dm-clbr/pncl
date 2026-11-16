import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPortalHierarchy, loadPortalTeamScope } from '../../supabase/functions/_shared/portalHierarchyData';
import { computeAgentPhases, listPortalUsers, resolveDisplayName } from '../../supabase/functions/_shared/adminAgents';
import { buildPortalHierarchyResponse } from '../../supabase/functions/_shared/portalHierarchy';

vi.mock('../../supabase/functions/_shared/adminAgents', () => ({
  listPortalUsers: vi.fn(), computeAgentPhases: vi.fn(),
  resolveDisplayName: (_user: unknown, name: string) => name || 'Agent',
}));

const users = [
  { id: 'leader', email: 'leader@thepncl.com', app_metadata: { onboarding_id: 'leader-record' } },
  { id: 'direct', email: 'direct@thepncl.com', app_metadata: {} },
  { id: 'partner', email: 'partner@thepncl.com', app_metadata: {} },
  { id: 'indirect', email: 'legacy@thepncl.com', app_metadata: {} },
  { id: 'outsider', email: 'outsider@thepncl.com', app_metadata: {} },
];
const rows = [
  { id: 'leader-record', supabase_user_id: 'leader', legal_name: 'Leader', referrer_user_id: 'outsider', npn: '1' },
  { id: 'direct-record', supabase_user_id: 'direct', legal_name: 'Direct', referrer_user_id: 'leader' },
  { id: 'partner-record', supabase_user_id: 'partner', legal_name: 'Partner', referrer_user_id: null },
  { id: 'legacy-record', supabase_user_id: null, workspace_email: ' LEGACY@THEPNCL.COM ', legal_name: 'Legacy', referrer_user_id: 'partner' },
  { id: 'outside-record', supabase_user_id: 'outsider', legal_name: 'Outsider', referrer_user_id: null },
];
const partners = [{ id: 'link', user_id_a: 'direct', user_id_b: 'partner', created_at: '', created_by_admin_id: null }];
function database(failTable?: string) {
  const queries: { table: string; columns?: string; ids?: string[] }[] = [];
  const from = vi.fn((table: string) => {
    const query: typeof queries[number] = { table }; queries.push(query);
    const builder = {
      select(columns: string) { query.columns = columns; return builder; },
      not() { return builder; }, order() { return builder; },
      in(_column: string, ids: string[]) { query.ids = ids; return builder; },
      then(resolve: (value: unknown) => void) {
        const data = table === 'onboarding_records' ? rows : table === 'hierarchy_partner_links' ? partners
          : table === 'portal_profiles' ? (query.ids ?? []).map(id => ({ user_id: id, comp_level: 100, npn: '99', profile_photo_path: null, updated_at: null }))
            : table === 'portal_profile_comp_level_history' ? [{ user_id: 'leader', effective_at: '2026-11-01' }] : [];
        return Promise.resolve({ data, error: table === failTable ? new Error('unavailable') : null }).then(resolve);
      },
    };
    return builder;
  });
  return { client: { from } as never, queries };
}
beforeEach(() => {
  vi.mocked(listPortalUsers).mockResolvedValue(users as never);
  vi.mocked(computeAgentPhases).mockReset().mockResolvedValue(new Map([['leader', 'complete']]));
});
describe('lightweight portal team loading', () => {
  it('resolves partner descendants and trusted enrollment/legacy links without loading admin details', async () => {
    const db = database();
    const scope = await loadPortalTeamScope(db.client, 'leader');
    expect(new Set(scope.ids)).toEqual(new Set(['leader', 'direct', 'partner', 'indirect']));
    expect(scope.users.map(user => user.id)).not.toContain('outsider');
    expect(db.queries.map(query => query.table)).toEqual(['onboarding_records', 'hierarchy_partner_links']);
    expect(db.queries[0].columns).not.toMatch(/ssn|phone|date_of_birth|personal_email/);
    expect(computeAgentPhases).not.toHaveBeenCalled();
  });
  it('loads profiles and phases only for the permitted branch and preserves response semantics', async () => {
    const db = database();
    const response = await loadPortalHierarchy(db.client, 'leader');
    const expectedAgents = users.map(user => {
      const row = rows.find(row => row.supabase_user_id === user.id || row.workspace_email?.trim().toLowerCase() === user.email)!;
      return { id: user.id, name: resolveDisplayName(user as never, row.legal_name), npn: '99', referrerId: row.referrer_user_id, referrerName: null,
        compLevel: 100, compLevelEffectiveAt: user.id === 'leader' ? '2026-11-01' : null, phase: user.id === 'leader' ? 'complete' as const : null };
    });
    expect(response).toEqual(buildPortalHierarchyResponse(expectedAgents, 'leader', partners));
    expect(JSON.stringify(response)).not.toContain('outsider');
    expect(vi.mocked(computeAgentPhases).mock.calls[0][1].map(user => user.id)).toEqual(['leader', 'direct', 'partner', 'indirect']);
    for (const query of db.queries.filter(query => query.table.startsWith('portal_profile'))) expect(query.ids).not.toContain('outsider');
  });
  it('does not load detail queries for a missing root and fails closed on membership errors', async () => {
    const db = database();
    expect((await loadPortalHierarchy(db.client, 'missing')).totalAgents).toBe(0);
    expect(computeAgentPhases).not.toHaveBeenCalled();
    await expect(loadPortalTeamScope(database('onboarding_records').client, 'leader')).rejects.toThrow('unavailable');
    await expect(loadPortalTeamScope(database('hierarchy_partner_links').client, 'leader')).rejects.toThrow('unavailable');
  });
});
