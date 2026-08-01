import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredReferralInviteId,
  persistReferralInviteId,
  readStoredReferralInviteId,
} from "@/lib/referral";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    clear: vi.fn(() => values.clear()),
    key: vi.fn(),
    get length() { return values.size; },
  } as Storage;
}

describe("referral continuity", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
  });

  it("survives a new tab through durable storage", () => {
    persistReferralInviteId("invite-123");
    sessionStorage.clear();
    expect(readStoredReferralInviteId()).toBe("invite-123");
    clearStoredReferralInviteId();
    expect(readStoredReferralInviteId()).toBeNull();
  });
});
