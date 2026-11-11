import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
class AuthError extends Error { constructor(message: string, public status: number, public code: string) { super(message); } }
const source = readFileSync('supabase/functions/_shared/hubWorkEmail.ts', 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const requireWorkEmail = new Function('AdminAuthError', compiled + '; return requireHubWorkEmail;')(AuthError);
const user = { id: 'hub-user', email: 'agent@thepncl.com', email_confirmed_at: '2026-10-26', app_metadata: { enrollment_version: 3, enrollment_ready: true } };
function db(data: unknown, error: unknown = null, count: number | null = 0, countError: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error })),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count, error: countError }).then(resolve) };
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
  it('accepts a matching administrator-provisioned legacy record without bypassing v3 enrollment', async () => {
    const row = { workspace_email: user.email, status: 'manual', enrollment_status: 'application_saved', released_at: null };
    expect(await requireWorkEmail({ ...user, app_metadata: { source: 'admin_manual' } }, db(row))).toBe(user.email);
    await expect(requireWorkEmail(user, db(row))).rejects.toMatchObject({ status: 409 });
    await expect(requireWorkEmail({ ...user, app_metadata: {} }, db({ ...row, released_at: 'today' }))).rejects.toMatchObject({ status: 409 });
    await expect(requireWorkEmail({ ...user, app_metadata: {} }, db({ ...row, workspace_email: 'other@thepncl.com' }))).rejects.toMatchObject({ status: 409 });
  });
  it('fails closed for missing, changed, released, failed or ambiguous onboarding records', async () => {
    for (const row of [null, { workspace_email: 'other@thepncl.com' }, { workspace_email: user.email, released_at: 'today' }, { workspace_email: user.email, status: 'failed' }]) {
      await expect(requireWorkEmail(user, db(row))).rejects.toMatchObject({ status: 409 });
    }
    await expect(requireWorkEmail(user, db(null, { message: 'multiple records' }))).rejects.toMatchObject({ status: 409 });
  });
  const grant = { user_id: user.id, email: user.email };
  const staff = { ...user, app_metadata: { hub_setup_onboarding_exception: grant } };
  it('allows an explicitly exempted staff identity without creating an onboarding record', async () => {
    const client = db(null);
    expect(await requireWorkEmail(staff, client)).toBe(user.email);
    expect(client.query.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
  });
  it('binds the exception to the exact UUID and current work email', async () => {
    for (const exception of [true, {}, { ...grant, user_id: 'another-user' }, { ...grant, email: 'another@thepncl.com' }]) {
      await expect(requireWorkEmail({ ...staff, app_metadata: { hub_setup_onboarding_exception: exception } }, db(null)))
        .rejects.toMatchObject({ status: 409 });
    }
    await expect(requireWorkEmail({ ...staff, email: 'renamed@thepncl.com' }, db(null))).rejects.toMatchObject({ status: 409 });
  });
  it('does not accept self-editable metadata, an admin role alone, or a removed exception', async () => {
    for (const metadata of [{}, { role: 'admin' }]) {
      await expect(requireWorkEmail({ ...staff, app_metadata: metadata, user_metadata: { hub_setup_onboarding_exception: grant } }, db(null)))
        .rejects.toMatchObject({ status: 409 });
    }
  });
  it('preserves lifecycle, enrollment and existing-record restrictions for exempted staff', async () => {
    for (const edit of [{ email_confirmed_at: null }, { banned_until: '2999-01-01' }, { deleted_at: 'today' }, { is_anonymous: true },
      { app_metadata: { ...staff.app_metadata, enrollment_version: 3, enrollment_ready: false } }]) {
      await expect(requireWorkEmail({ ...staff, ...edit }, db(null))).rejects.toMatchObject({ status: 403 });
    }
    for (const metadata of [{ ...staff.app_metadata, onboarding_id: 'existing-record' },
      { ...staff.app_metadata, enrollment_version: 3, enrollment_ready: true }]) {
      await expect(requireWorkEmail({ ...staff, app_metadata: metadata }, db(null))).rejects.toMatchObject({ status: 409 });
    }
    for (const row of [{ workspace_email: user.email, released_at: 'today' }, { workspace_email: user.email, status: 'failed' }]) {
      await expect(requireWorkEmail(staff, db(row))).rejects.toMatchObject({ status: 409 });
    }
    for (const client of [db(null, { message: 'query failed' }), db(null, null, 1), db(null, null, null), db(null, null, 0, { message: 'count failed' })]) {
      await expect(requireWorkEmail(staff, client)).rejects.toMatchObject({ status: 409 });
    }
  });
});
