import { buildAssistHierarchyTree, type HierarchyAgent } from "./assistHierarchy.ts";
import { buildAdminAssistHierarchyResponse, type AssistHierarchyNode } from "./adminAssistHierarchyResponse.ts";
import type { PartnerLinkRow } from "./hierarchyPartners.ts";
import type { AgentSummary } from "./adminAgents.ts";

type PortalHierarchyAgent = HierarchyAgent & Partial<Pick<AgentSummary,
  "compLevel" | "compLevelEffectiveAt" | "phase" | "profilePhotoPath" | "profileUpdatedAt"
>>;

/** The authenticated user is always the root; never accept a client-selected root here. */
export function buildPortalHierarchyResponse(
  agents: PortalHierarchyAgent[],
  userId: string,
  partnerLinks: PartnerLinkRow[],
) {
  const tree = userId ? buildAssistHierarchyTree(agents, userId, partnerLinks) : [];
  const people = new Map<string, { id: string; name: string; npn: string | null }>();
  const rootIds = new Set(tree.flatMap((node) => node.memberIds ?? [node.id]));

  function visit(node: AssistHierarchyNode) {
    for (const person of node.members ?? [node]) {
      people.set(person.id, { id: person.id, name: person.name, npn: person.npn });
      // The team's root must not disclose identities from outside this branch.
      if (rootIds.has(person.id)) {
        person.referrerName = null;
        person.referrerNpn = null;
      }
    }
    if (node === tree[0]) {
      node.referrerName = null;
      node.referrerNpn = null;
    }
    node.children.forEach(visit);
  }
  tree.forEach(visit);

  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  function limitUpline(node: AssistHierarchyNode) {
    for (const person of node.members ?? [node]) {
      const referrerId = agentsById.get(person.id)?.referrerId;
      if (!referrerId || !people.has(referrerId)) {
        person.referrerName = null;
        person.referrerNpn = null;
      }
    }
    if (node.isPartnerGroup && node.members?.length) {
      node.referrerName = node.members[0].referrerName;
      node.referrerNpn = node.members[0].referrerNpn;
    }
    node.children.forEach(limitUpline);
  }
  tree.forEach(limitUpline);

  return {
    ...buildAdminAssistHierarchyResponse({
      tree,
      focusOptions: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
      totalAgents: people.size,
    }),
    // Comp and onboarding stats are shared only for people in this verified branch.
    // Keep this allowlist separate from the much broader administrative summary.
    people: [...people.keys()].map((id) => {
      const agent = agentsById.get(id)!;
      return {
        id,
        compLevel: agent.compLevel ?? null,
        compLevelEffectiveAt: agent.compLevelEffectiveAt ?? null,
        phase: agent.phase ?? null,
        profilePhotoPath: agent.profilePhotoPath ?? null,
        profileUpdatedAt: agent.profileUpdatedAt ?? null,
      };
    }),
  };
}
