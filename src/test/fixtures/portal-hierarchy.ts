import type { PortalHierarchyResponse } from "@/lib/portal-hierarchy";

export function portalHierarchyFixture(): PortalHierarchyResponse {
  const rows = [
    { id: "leader", name: "Alex Morgan", referrerId: null, compLevel: 120, phase: "complete" as const },
    { id: "direct", name: "Jordan Rivera", referrerId: "leader", compLevel: 100, phase: "sales_ready" as const },
    { id: "indirect", name: "Casey Reed", referrerId: "direct", compLevel: 85, phase: "licensing" as const },
    { id: "partner-a", name: "Sam Ellis", referrerId: "leader", compLevel: 95, phase: "pre_license" as const },
    { id: "partner-b", name: "Jamie Ellis", referrerId: "leader", compLevel: 90, phase: "on_board" as const },
  ].map((person) => ({ ...person, npn: "1234567", referrerName: null, profilePhotoPath: null, profileUpdatedAt: null, compLevelEffectiveAt: null }));
  const member = (id: string) => {
    const person = rows.find((row) => row.id === id)!;
    return { id, name: person.name, npn: person.npn, referrerName: person.referrerId ? rows.find((row) => row.id === person.referrerId)!.name : null, referrerNpn: person.referrerId ? "1234567" : null };
  };
  const members = [member("partner-b"), member("partner-a")];
  return {
    readOnly: true, totalAgents: rows.length,
    tree: [{ ...member("leader"), children: [
      { ...member("direct"), children: [{ ...member("indirect"), children: [] }] },
      { id: "partner:partner-a:partner-b", name: "Jamie Ellis & Sam Ellis", npn: "1234567 · 1234567", referrerName: "Alex Morgan", referrerNpn: "1234567", isPartnerGroup: true, memberIds: members.map((p) => p.id), members, children: [] },
    ] }],
    focusOptions: rows.map(({id, name, npn}) => ({id, name, npn})),
    people: rows.map(({id, compLevel, compLevelEffectiveAt, phase, profilePhotoPath, profileUpdatedAt}) => ({id, compLevel, compLevelEffectiveAt, phase, profilePhotoPath, profileUpdatedAt})),
  };
}
