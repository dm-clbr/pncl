import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
class AuthError extends Error { constructor(message: string, public status: number, public code: string) { super(message); } }
const source = readFileSync('supabase/functions/_shared/hubWorkEmail.ts', 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const requireWorkEmail = new Function('AdminAuthError', compiled + '; return requireHubWorkEmail;')(AuthError);
const user = { id: 'hub-user', email: 'agent@thepncl.com', email_confirmed_at: '2026-10-26', app_metadata: { enrollment_version: 3, enrollment_ready: true } };
function db(data: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error })) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  return { from: vi.fn(() => query), query };
}
describe('canonical Hub onboarding identity', () => {
  it('accepts only the matching active onboarding work email', async () => {
    const client = db({ workspace_email: user.email, released_at: null, status: 'ready' });
    expect(await requireWorkEmail(user, client)).toBe(user.email);
    expect(client.query.eq).toHaveBeenCalledWith('supabase_user_id', user.id);
    expect(client.query.eq).toHaveBeenCalledWith('workspace_email', user.email);
  });
  it('denies unverified, wrong-domain and incomplete onboarding sessions', async () => {
    for (const edit of [{ email_confirmed_at: null }, { banned_until: '2999-01-01' }, { deleted_at: 'today' }, { is_anonymous: true }, { email: 'x@thepncl.com.evil.test' }, { app_metadata: { enrollment_version: 3, enrollment_ready: false } }]) {
      const client = db(null);
      await expect(requireWorkEmail({ ...user, ...edit }, client)).rejects.toMatchObject({ status: 403 });
      expect(client.from).not.toHaveBeenCalled();
    }
  });
  it('fails closed for missing, changed, released, failed or ambiguous onboarding records', async () => {
    for (const row of [null, { workspace_email: 'other@thepncl.com' }, { workspace_email: user.email, released_at: 'today' }, { workspace_email: user.email, status: 'failed' }]) {
      await expect(requireWorkEmail(user, db(row))).rejects.toMatchObject({ status: 409 });
    }
    await expect(requireWorkEmail(user, db(null, { message: 'multiple records' }))).rejects.toMatchObject({ status: 409 });
  });
});
