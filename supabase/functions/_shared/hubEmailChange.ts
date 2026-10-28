type Result = { data: unknown; error: { message?: string } | null };
export type HubEmailRpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<Result> };
export type HubEmailAdmin = { auth: { admin: {
  getUserById(id: string): Promise<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
  updateUserById(id: string, attrs: { email: string; email_confirm: boolean }): Promise<{
    data: { user: { id: string; email?: string; email_confirmed_at?: string } | null }; error: unknown;
  }>;
} } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class HubEmailError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export function parseHubEmailChange(value: unknown): { userId: string; email: string } {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!body || Object.keys(body).length !== 2 || typeof body.userId !== 'string' || !uuid.test(body.userId)
    || typeof body.email !== 'string' || body.email.trim().length > 254 || !/^[^\s@]+@thepncl\.com$/i.test(body.email.trim())) {
    throw new HubEmailError('invalid_request', 400, 'Provide a valid account and @thepncl.com work email.');
  }
  return { userId: body.userId, email: body.email.trim().toLowerCase() };
}
export async function changeHubWorkEmail(rpc: HubEmailRpc, admin: HubEmailAdmin, payload: { userId: string; email: string }) {
  const target = await admin.auth.admin.getUserById(payload.userId);
  if (target.error || !target.data.user?.email) throw new HubEmailError('not_found', 404, 'User not found.');
  const previous = target.data.user.email.toLowerCase();
  if (!/^[^\s@]+@thepncl\.com$/.test(previous)) throw new HubEmailError('invalid_domain', 400, 'Only PNCL work accounts can be managed here.');
  if (previous === payload.email) return { userId: payload.userId, email: payload.email, message: 'Email is already up to date.' };
  const prepared = await rpc.rpc('prepare_hub_work_email_change', { p_user_id: payload.userId, p_expected_email: previous, p_email: payload.email });
  if (prepared.error) {
    const code = prepared.error.message ?? '';
    if (code === 'admin_required') throw new HubEmailError('forbidden', 403, 'Full admin access required.');
    if (code === 'email_taken') throw new HubEmailError('email_taken', 409, 'That email is already assigned or reserved.');
    if (code === 'email_change_cooldown') throw new HubEmailError('email_change_cooldown', 429, 'Wait one minute and refresh the account before retrying.');
    throw new HubEmailError('review_required', 409, 'The account changed or needs review. Refresh it before retrying.');
  }
  const permit = prepared.data as { complete?: boolean; permitId?: string } | null;
  if (permit?.complete === true) return { userId: payload.userId, email: payload.email, message: 'Email is already up to date.' };
  if (typeof permit?.permitId !== 'string' || !uuid.test(permit.permitId)) throw new HubEmailError('update_failed', 502, 'Unable to authorize the email update.');
  try {
    const result = await admin.auth.admin.updateUserById(payload.userId, { email: payload.email, email_confirm: true });
    if (result.error || result.data.user?.id !== payload.userId || result.data.user.email?.toLowerCase() !== payload.email || !result.data.user.email_confirmed_at) {
      throw new HubEmailError('update_failed', 409, 'Email update could not be confirmed. Refresh the account before retrying.');
    }
    return { userId: payload.userId, email: payload.email, message: 'Portal email updated.' };
  } finally {
    // Exact permit revocation cannot affect a later operation. Expiry is 60s.
    await Promise.resolve(rpc.rpc('cancel_hub_work_email_change', { p_user_id: payload.userId, p_permit_id: permit.permitId })).catch(() => undefined);
  }
}
