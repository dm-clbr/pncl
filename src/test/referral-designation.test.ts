import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReferralInvite, toReferralInviteSummary, claimReferralInvite, type ReferralInviteRow } from "../../supabase/functions/_shared/portalReferralInvites";
import { initializePortalAgentDesignation } from "../../supabase/functions/_shared/portalAgentDesignations";

vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({ isValidReferrerUserId: vi.fn(), resolveReferrer: vi.fn() }));
vi.mock("../../supabase/functions/_shared/hierarchyPartners.ts", () => ({ findPartnerLinkForUser: vi.fn() }));
beforeEach(() => vi.stubGlobal("Deno", { env: { get: () => "https://thepncl.com" } }));
afterEach(() => vi.unstubAllGlobals());
const invite = { id: "invite-1", referrer_user_id: "upline-1", comp_level: 95, recipient_label: "Jordan", status: "pending", expires_at: "2099-01-01", created_at: "2026-10-07", consumed_at: null } as ReferralInviteRow;
function clientForInvite() {
  const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: invite, error: null }) }) });
  const from = vi.fn((table: string) => table === "portal_profiles"
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { comp_level: 100 } }) }) }) }
    : { insert });
  return { from, insert };
}
describe("Stored referral designation", () => {
  it.each(["ibo", "loa"] as const)("stores %s on the invite", async (designation) => {
    const client = clientForInvite();
    await createReferralInvite(client as never, "upline-1", 95, "Jordan", designation);
    expect(client.insert).toHaveBeenCalledWith(expect.objectContaining({ agent_designation: designation, comp_level: 95, referrer_user_id: "upline-1" }));
  });
  it("retains LOA for older clients and links", async () => {
    const client = clientForInvite();
    await createReferralInvite(client as never, "upline-1", 95, "Jordan");
    expect(client.insert).toHaveBeenCalledWith(expect.objectContaining({ agent_designation: "loa" }));
    expect(toReferralInviteSummary(invite).agentDesignation).toBe("loa");
    expect(toReferralInviteSummary({ ...invite, agent_designation: "ibo" }, "partner-1")).toMatchObject({ agentDesignation: "ibo", sharedFromPartner: true });
  });
  it("rejects invalid designations before writing", async () => {
    const client = clientForInvite();
    await expect(createReferralInvite(client as never, "upline-1", 95, "Jordan", "other" as never)).rejects.toThrow("IBO or LOA");
    expect(client.from).not.toHaveBeenCalled();
  });
  it("preserves the stored designation when the server claims a link", async () => {
    const query = { update: vi.fn(), eq: vi.fn(), gt: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { ...invite, status: "consumed", agent_designation: "ibo" } }) };
    for (const key of ["update", "eq", "gt", "select"] as const) query[key].mockReturnValue(query);
    const claimed = await claimReferralInvite({ from: () => query } as never, invite.id);
    expect(claimed.agent_designation).toBe("ibo");
    expect(query.eq).toHaveBeenCalledWith("status", "pending");
  });
  it("assigns IBO once and preserves a subsequent admin correction on retry", async () => {
    const stored = new Map<string, string>();
    const upsert = vi.fn(async (row, options) => {
      if (!stored.has(row.user_id) || !options.ignoreDuplicates) stored.set(row.user_id, row.designation);
      return { error: null };
    });
    const client = { from: () => ({ upsert }) };
    await initializePortalAgentDesignation(client as never, "recruit-1", "ibo");
    expect(stored.get("recruit-1")).toBe("ibo");
    stored.set("recruit-1", "loa");
    await initializePortalAgentDesignation(client as never, "recruit-1", "ibo");
    expect(stored.get("recruit-1")).toBe("loa");
  });
  it("assigns LOA for legacy enrollment snapshots", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    await initializePortalAgentDesignation({ from: () => ({ upsert }) } as never, "old-recruit", undefined);
    expect(upsert).toHaveBeenCalledWith({ user_id: "old-recruit", designation: "loa" }, { onConflict: "user_id", ignoreDuplicates: true });
  });
  it("fails setup if the assignment cannot be saved", async () => {
    const client = { from: () => ({ upsert: async () => ({ error: { message: "DB unavailable" } }) }) };
    await expect(initializePortalAgentDesignation(client as never, "recruit-1", "ibo")).rejects.toThrow("Unable to assign");
  });
});
