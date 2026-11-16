import { describe, expect, it } from "vitest";
import { buildPortalHierarchyResponse } from "../../supabase/functions/_shared/portalHierarchy";
import type { HierarchyAgent } from "../../supabase/functions/_shared/assistHierarchy";
import type { PartnerLinkRow } from "../../supabase/functions/_shared/hierarchyPartners";

const agent = (id: string, referrerId: string | null = null) => ({
  id, name: id, npn: `npn-${id}`, referrerId, referrerName: referrerId,
  email: `${id}@private.example`, compLevel: 110, phoneNumber: "private-phone",
  credentials: "private-credentials", documents: ["private-document"], bankAccount: "private-bank",
});
const agents = [agent("upline"), agent("leader", "upline"), agent("direct", "leader"),
  agent("indirect", "direct"), agent("other-team", "upline"), agent("other-child", "other-team")];
const partner = (a: string, b: string): PartnerLinkRow => ({
  id: `${a}-${b}`, user_id_a: a, user_id_b: b, created_at: "2026-11-16", created_by_admin_id: null,
});

describe("portal hierarchy scope", () => {
  it("includes every downline level, but excludes upline, peers, and other teams from all response fields", () => {
    const result = buildPortalHierarchyResponse(agents, "leader", []);
    expect(result.totalAgents).toBe(3);
    expect(result.tree[0].id).toBe("leader");
    expect(result.tree[0].children[0].children[0].id).toBe("indirect");
    expect(result.focusOptions.map((person) => person.id).sort()).toEqual(["direct", "indirect", "leader"]);
    expect(JSON.stringify(result)).not.toMatch(/upline|other-team|other-child|private|email|phoneNumber|credentials|documents|bankAccount/);
    expect(result.readOnly).toBe(true);
    expect(result.people.map((person) => [person.id, person.compLevel])).toEqual([["leader", 110], ["direct", 110], ["indirect", 110]]);
  });

  it("shows a leader with no downline and fails closed for unknown or missing roots", () => {
    expect(buildPortalHierarchyResponse(agents, "other-child", []).totalAgents).toBe(1);
    for (const root of ["missing", ""]) {
      expect(buildPortalHierarchyResponse(agents, root, [])).toEqual({
        tree: [], focusOptions: [], totalAgents: 0, readOnly: true, people: [],
      });
    }
  });

  it("preserves shared partner downlines for either partner and counts people once", () => {
    const roster = [...agents, agent("partner"), agent("partner-child", "partner")];
    const links = [partner("leader", "partner")];
    for (const root of ["leader", "partner"]) {
      const result = buildPortalHierarchyResponse(roster, root, links);
      expect(result.totalAgents).toBe(5);
      expect(result.tree[0].isPartnerGroup).toBe(true);
      expect(result.tree[0].memberIds).toEqual(["leader", "partner"]);
      expect(result.tree[0].children.map((child) => child.id)).toEqual(["direct", "partner-child"]);
      expect(JSON.stringify(result)).not.toMatch(/upline|other-team|private/);
    }
  });

  it("includes descendant partner groups without leaking their outside uplines", () => {
    const result = buildPortalHierarchyResponse([...agents, agent("partner", "other-team")], "leader", [partner("direct", "partner")]);
    expect(result.totalAgents).toBe(4);
    expect(result.tree[0].children[0].members?.find((person) => person.id === "partner")?.referrerName).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/other-team|upline/);
  });

  it("terminates cyclic referrals without duplicating people", () => {
    const cyclic: HierarchyAgent[] = [agent("leader", "direct"), agent("direct", "leader")];
    const result = buildPortalHierarchyResponse(cyclic, "leader", []);
    expect(result.totalAgents).toBe(2);
    expect(result.tree[0].children[0].children).toEqual([]);
  });
});
