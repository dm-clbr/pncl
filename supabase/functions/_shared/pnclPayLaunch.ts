import { object, SetupError, setupRequest } from './pnclSetupContract.ts';

export const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hub-only extension. The existing LeadSpply setup endpoint keeps its contract. */
export function hubSetupRequest(value: unknown) {
  const { expectedAccountId, ...input } = object(value);
  if (expectedAccountId !== undefined && (input.action !== 'pay'
    || typeof expectedAccountId !== 'string' || !ACCOUNT_ID.test(expectedAccountId))) {
    throw new SetupError('invalid_request', 400);
  }
  return { body: setupRequest(input), expectedAccountId: typeof expectedAccountId === 'string' ? expectedAccountId.toLowerCase() : null };
}

/** A browser-supplied ID can only restrict a launch, never select its identity. */
export function assertPaySourceAccount(expected: string | null, account: { id: string } | null) {
  if (expected && account?.id.toLowerCase() !== expected) throw new SetupError('pay_account_mismatch');
}
