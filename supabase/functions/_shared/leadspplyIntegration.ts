// The PNCL browser never supplies either account identity or the upstream URL.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid integration data');
  return value as RecordValue;
};
function onlyKeys(value: RecordValue, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('Invalid request');
}
const text = (value: unknown, max = 1000): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid integration data');
  return value;
};
const uuid = (value: unknown): string => {
  const result = text(value, 36);
  if (!uuidPattern.test(result)) throw new Error('Invalid integration data');
  return result;
};
const nullable = <T>(value: unknown, read: (v: unknown) => T): T | null => value === null ? null : read(value);
const count = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid integration data');
  return value;
};
const date = (value: unknown): string => {
  const result = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error('Invalid integration data');
  return result;
};
function list<T>(value: unknown, read: (v: unknown) => T, max = 10000): T[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('Invalid integration data');
  return value.map(read);
}
const tier = (value: unknown): number | null => nullable(value, v => {
  const n = count(v);
  if (n < 70 || n > 145 || n % 5) throw new Error('Invalid integration data');
  return n;
});
function syncStatus(value: unknown): string {
  const result = text(value, 30);
  if (!['pending', 'synced', 'upline_unlinked', 'source_missing'].includes(result)) throw new Error('Invalid integration data');
  return result;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid integration data');
  return value;
}
function autoLink(value: unknown) {
  const row = record(value);
  const cadenceMinutes = count(row.cadenceMinutes);
  if (cadenceMinutes < 1 || cadenceMinutes > 1440) throw new Error('Invalid integration data');
  const lastRun = nullable(row.lastRun, value => {
    const run = record(value);
    const status = text(run.status, 30);
    if (!['success', 'failed'].includes(status)) throw new Error('Invalid integration data');
    return {
      created_at: date(run.created_at), status,
      scanned_count: count(run.scanned_count), linked_count: count(run.linked_count), review_count: count(run.review_count),
      error_code: nullable(run.error_code, value => text(value, 80)),
    };
  });
  return { enabled: boolean(row.enabled), cadenceMinutes, lastRun };
}
function linkIdentity(value: unknown) {
  const row = record(value);
  return { pncl_user_id: uuid(row.pncl_user_id), leadspply_user_id: uuid(row.leadspply_user_id) };
}
export type PortalIntegrationRequest =
  | { action: 'preview' | 'status' }
  | { action: 'sync'; token: string; links: ReturnType<typeof linkIdentity>[] }
  | { action: 'redeem'; code: string }
  | { action: 'update_email'; expectedEmail: string };

export function parsePortalIntegrationRequest(value: unknown): PortalIntegrationRequest {
  const body = record(value);
  if (body.action === 'preview' || body.action === 'status') {
    onlyKeys(body, ['action']);
    return { action: body.action };
  }
  if (body.action === 'update_email') {
    onlyKeys(body, ['action', 'expectedEmail']);
    const expectedEmail = text(body.expectedEmail, 254).trim().toLowerCase();
    if (!/^[^\s@]+@thepncl\.com$/.test(expectedEmail)) throw new Error('Invalid request');
    return { action: 'update_email', expectedEmail };
  }
  if (body.action === 'sync') {
    onlyKeys(body, ['action', 'token', 'links']);
    const token = text(body.token, 64);
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('Invalid request');
    const links = list(body.links, value => {
      const row = record(value);
      onlyKeys(row, ['pncl_user_id', 'leadspply_user_id']);
      return linkIdentity(row);
    }, 1000);
    if (new Set(links.map(l => l.pncl_user_id)).size !== links.length
      || new Set(links.map(l => l.leadspply_user_id)).size !== links.length) throw new Error('Invalid request');
    return { action: 'sync', token, links };
  }
  if (body.action === 'redeem') {
    onlyKeys(body, ['action', 'code']);
    const code = text(body.code, 80).replace(/[\s-]/g, '').toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(code)) throw new Error('Invalid request');
    return { action: 'redeem', code };
  }
  throw new Error('Invalid request');
}

function sourceRep(value: unknown) {
  const row = record(value);
  return {
    id: uuid(row.id), email: text(row.email), personal_email: nullable(row.personal_email, text),
    first_name: text(row.first_name), last_name: text(row.last_name), npn: nullable(row.npn, text),
    agent_number: nullable(row.agent_number, count), comp_level: tier(row.comp_level),
    comp_effective_at: nullable(row.comp_effective_at, date), parent_id: nullable(row.parent_id, uuid),
  };
}
function targetRep(value: unknown) {
  const row = record(value);
  return { id: uuid(row.id), email: text(row.email), first_name: text(row.first_name), last_name: text(row.last_name),
    npn: nullable(row.npn, text), parent_id: nullable(row.parent_id, uuid) };
}
/** Project the approved identity, hierarchy and monitoring fields. No customer or credential data passes through. */
export function sanitizePortalIntegrationPreview(value: unknown) {
  const body = record(value);
  const token = text(body.token, 64);
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('Invalid integration data');
  return {
    matches: list(body.matches, value => {
      const row = record(value);
      const status = text(row.status, 30);
      if (!['linked', 'suggested', 'name_review', 'conflict', 'unmatched'].includes(status)) throw new Error('Invalid integration data');
      return { source: sourceRep(row.source), status, reason: text(row.reason), candidates: list(row.candidates, value => {
        const candidate = record(value);
        return { target: targetRep(candidate.target), reasons: list(candidate.reasons, v => text(v, 100), 10) };
      }, 10000) };
    }),
    targets: list(body.targets, targetRep),
    links: list(body.links, value => {
      const row = record(value);
      return { ...linkIdentity(row), pay_tier: tier(row.pay_tier), pncl_parent_id: nullable(row.pncl_parent_id, uuid),
        sync_status: syncStatus(row.sync_status), synced_at: nullable(row.synced_at, date) };
    }),
    partners: body.partners === null ? null : list(body.partners, value => {
      const row = record(value);
      return { user_id_a: uuid(row.user_id_a), user_id_b: uuid(row.user_id_b) };
    }, 5000),
    token, revision: count(body.revision),
    recentRuns: list(body.recentRuns, value => {
      const row = record(value);
      return { id: uuid(row.id), created_at: date(row.created_at), revision: count(row.revision),
        linked_count: count(row.linked_count), synced_count: count(row.synced_count), unresolved_count: count(row.unresolved_count),
        pncl_actor_id: nullable(row.pncl_actor_id, uuid), actor_id: nullable(row.actor_id, uuid) };
    }, 50),
    events: list(body.events, value => {
      const row = record(value);
      return { id: uuid(row.id), created_at: date(row.created_at), kind: text(row.kind, 50),
        pncl_user_id: nullable(row.pncl_user_id, uuid), leadspply_user_id: nullable(row.leadspply_user_id, uuid),
        pncl_actor_id: uuid(row.pncl_actor_id) };
    }, 50),
    ...(body.autoLink === undefined ? {} : { autoLink: autoLink(body.autoLink) }),
  };
}
export function sanitizePortalIntegrationStatus(value: unknown) {
  const body = record(value);
  if (!['not_linked', 'connected', 'account_unavailable'].includes(String(body.state))) throw new Error('Invalid integration data');
  if (body.state !== 'connected') return { state: body.state as string, account: null };
  const account = record(body.account);
  return { state: 'connected', account: {
    ...(account.leadspply_user_id === undefined ? {} : { leadspply_user_id: uuid(account.leadspply_user_id) }),
    name: text(account.name), email: text(account.email),
    sync_status: syncStatus(account.sync_status), synced_at: nullable(account.synced_at, date),
    pay_tier: tier(account.pay_tier), linked_at: date(account.linked_at) },
    ...(body.pending === true ? { pending: true } : {}) };
}
export function sanitizePortalIntegrationSync(value: unknown) {
  const body = record(value);
  return { linked: count(body.linked), synced: count(body.synced), unresolved: count(body.unresolved), revision: count(body.revision),
    ...(body.partners !== undefined ? { partners: count(body.partners), unresolved_partners: count(body.unresolved_partners) } : {}) };
}

const errorMessages: Record<string, string> = {
  ownership_required: 'Verify your LeadSpply account with a fresh connection code before updating its email.',
  email_conflict: 'That email change needs support review. Your existing account has been preserved.',
  email_update_failed: 'The email update could not be confirmed. Refresh status before trying again.',
  email_update_cooldown: 'Please wait one minute, then refresh status before trying again.',
  work_email_review_required: 'Your PNCL work email changed or needs review. Refresh status or contact support.',
  preview_stale: 'PNCL or LeadSpply changed since this preview. Refresh and review the changes again.',
  identity_review_required: 'Your account match needs admin review. Ask PNCL support to verify your email or NPN and connect the accounts.',
  account_already_linked: 'One of these accounts is already connected. Ask PNCL support to review the connection.',
  invalid_code: 'This connection code is invalid, expired, or already used. Generate a new code in LeadSpply.',
  account_unavailable: 'Your LeadSpply account is unavailable. Contact PNCL support.',
  source_missing: 'Your PNCL profile could not be verified. Contact PNCL support.',
  sync_conflict: 'The sync could not be applied. Refresh and review account links and hierarchy before trying again.',
};
export function sanitizePortalIntegrationError(status: number, value: unknown) {
  const code = value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue).error : null;
  if ([400, 403, 409, 429].includes(status) && typeof code === 'string' && errorMessages[code]) {
    return { status, body: { error: code, message: errorMessages[code] } };
  }
  return { status: 502, body: { error: 'integration_unavailable', message: 'LeadSpply integration is unavailable right now. Try again.' } };
}
