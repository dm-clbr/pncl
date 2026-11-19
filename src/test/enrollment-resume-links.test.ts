import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateEnrollmentHandoff } from "../../supabase/functions/_shared/enrollmentHandoff";
import { encryptSecret, hashHandoffToken, validateHandoffToken } from "../../supabase/functions/_shared/security";

const now = Date.parse("2026-11-19T20:00:00Z");
const expiresAt = new Date(now + 86400000).toISOString();
type Record = { id: string; handoff_token_hash: string; handoff_token_expires_at: string; handoff_token_encrypted: string | null; released_at: string | null };

// Models conditional database updates atomically, including competing admin requests.
function database(initial: Record | null) {
  let row = initial ? { ...initial } : null;
  let writes = 0;
  const from = vi.fn(() => {
    let patch: Partial<Record> | undefined;
    const filters: [keyof Record, unknown][] = [];
    const query = {
      select: () => query,
      update: (value: Partial<Record>) => { patch = value; return query; },
      eq: (key: keyof Record, value: unknown) => { filters.push([key, value]); return query; },
      is: (key: keyof Record, value: unknown) => { filters.push([key, value]); return query; },
      maybeSingle: async () => {
        if (!row || filters.some(([key, value]) => row?.[key] !== value)) return { data: null, error: null };
        if (patch) { row = { ...row, ...patch }; writes++; }
        return { data: { ...row }, error: null };
      },
    };
    return query;
  });
  return {
    client: { from } as unknown as Parameters<typeof getOrCreateEnrollmentHandoff>[0],
    get row() { return row; }, get writes() { return writes; },
  };
}

async function legacy() {
  return { id: "enrollment-1", handoff_token_hash: await hashHandoffToken("original-token"), handoff_token_expires_at: expiresAt, handoff_token_encrypted: null, released_at: null };
}

beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: () => "test-only-encryption-key" } });
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("reusable enrollment handoffs", () => {
  it("returns the same valid link on repeated copies, without extending its expiry", async () => {
    const db = database(await legacy());
    const first = await getOrCreateEnrollmentHandoff(db.client, "enrollment-1", now);
    const second = await getOrCreateEnrollmentHandoff(db.client, "enrollment-1", now + 10000);
    expect(first.reused).toBe(false);
    expect(second).toEqual({ ...first, reused: true });
    expect(db.writes).toBe(1);
    expect(db.row?.handoff_token_encrypted).not.toContain(first.token);
    expect(await validateHandoffToken(first.token, db.row!.handoff_token_hash)).toBe(true);
    expect(await validateHandoffToken("wrong-token", db.row!.handoff_token_hash)).toBe(false);
  });

  it("preserves a new agent’s original link when an admin copies it", async () => {
    const db = database({ ...await legacy(), handoff_token_encrypted: await encryptSecret("original-token") });
    expect(await getOrCreateEnrollmentHandoff(db.client, "enrollment-1", now)).toEqual({ token: "original-token", expiresAt, reused: true });
    expect(db.writes).toBe(0);
  });

  it("returns one winning token to concurrent requests", async () => {
    const db = database(await legacy());
    const links = await Promise.all(Array.from({ length: 5 }, () => getOrCreateEnrollmentHandoff(db.client, "enrollment-1", now)));
    expect(new Set(links.map((link) => link.token)).size).toBe(1);
    expect(db.writes).toBe(1);
    for (const link of links) expect(await validateHandoffToken(link.token, db.row!.handoff_token_hash)).toBe(true);
  });

  it("rotates an expired link and rejects the old token", async () => {
    const db = database(await legacy());
    const old = await getOrCreateEnrollmentHandoff(db.client, "enrollment-1", now);
    const fresh = await getOrCreateEnrollmentHandoff(db.client, "enrollment-1", now + 86400000);
    expect(fresh.token).not.toBe(old.token);
    expect(await validateHandoffToken(old.token, db.row!.handoff_token_hash)).toBe(false);
    expect(await validateHandoffToken(fresh.token, db.row!.handoff_token_hash)).toBe(true);
  });

  it("does not reuse cached material after a deliberate hash rotation", async () => {
    const db = database({ ...await legacy(), handoff_token_hash: await hashHandoffToken("rotated"), handoff_token_encrypted: await encryptSecret("original-token") });
    const fresh = await getOrCreateEnrollmentHandoff(db.client, "enrollment-1", now);
    expect(fresh.token).not.toBe("original-token");
    expect(fresh.reused).toBe(false);
  });

  it("does not create links for released duplicate enrollments or missing records", async () => {
    const released = database({ ...await legacy(), released_at: new Date(now).toISOString() });
    await expect(getOrCreateEnrollmentHandoff(released.client, "enrollment-1", now)).rejects.toMatchObject({ code: "enrollment_released" });
    expect(released.writes).toBe(0);
    await expect(getOrCreateEnrollmentHandoff(database(null).client, "enrollment-1", now)).rejects.toMatchObject({ code: "not_found" });
  });
});
