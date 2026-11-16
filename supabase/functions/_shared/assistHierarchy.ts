import type { AssistHierarchyMember, AssistHierarchyNode } from "./adminAssistHierarchyResponse.ts";
import { buildPartnerLookup, getPartnerGroupId, type PartnerLinkRow } from "./hierarchyPartners.ts";

export interface HierarchyAgent {
  id: string;
  name: string;
  npn: string | null;
  referrerId: string | null;
  referrerName: string | null;
}

function collectMergedChildAgents(
  childrenByReferrer: Map<string, HierarchyAgent[]>,
  memberIds: string[],
  excludeIds: Set<string>,
): HierarchyAgent[] {
  const childAgents = new Map<string, HierarchyAgent>();
  for (const memberId of memberIds) {
    for (const child of childrenByReferrer.get(memberId) ?? []) {
      if (!excludeIds.has(child.id)) {
        childAgents.set(child.id, child);
      }
    }
  }
  return [...childAgents.values()];
}

function toAssistHierarchyMember(
  agent: HierarchyAgent,
  byId: Map<string, HierarchyAgent>,
): AssistHierarchyMember {
  const referrer = agent.referrerId ? byId.get(agent.referrerId) : null;
  return {
    id: agent.id,
    name: agent.name,
    npn: agent.npn,
    referrerName: referrer?.name ?? agent.referrerName ?? null,
    referrerNpn: referrer?.npn ?? null,
  };
}

export function buildAssistHierarchyTree(
  agents: HierarchyAgent[],
  rootUserId?: string,
  partnerLinks: PartnerLinkRow[] = [],
): AssistHierarchyNode[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const partnerByUserId = buildPartnerLookup(partnerLinks);
  const mergedIntoGroup = new Set<string>();
  const childrenByReferrer = new Map<string, HierarchyAgent[]>();

  for (const agent of agents) {
    if (!agent.referrerId || !byId.has(agent.referrerId)) continue;
    const siblings = childrenByReferrer.get(agent.referrerId) ?? [];
    siblings.push(agent);
    childrenByReferrer.set(agent.referrerId, siblings);
  }

  const toNode = (agent: HierarchyAgent): AssistHierarchyNode | null => {
    if (mergedIntoGroup.has(agent.id)) return null;

    const partnerId = partnerByUserId.get(agent.id);
    const partner = partnerId ? byId.get(partnerId) : null;

    if (partner && !mergedIntoGroup.has(partner.id)) {
      mergedIntoGroup.add(agent.id);
      mergedIntoGroup.add(partner.id);

      const members = [agent, partner]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((member) => toAssistHierarchyMember(member, byId));

      const childAgents = collectMergedChildAgents(
        childrenByReferrer,
        [agent.id, partner.id],
        new Set([agent.id, partner.id]),
      );

      const children = childAgents
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toNode)
        .filter((node): node is AssistHierarchyNode => node !== null);

      return {
        id: getPartnerGroupId(agent.id, partner.id),
        name: members.map((member) => member.name).join(" & "),
        npn: members.map((member) => member.npn ?? "—").join(" · "),
        referrerName: members[0]?.referrerName ?? null,
        referrerNpn: members[0]?.referrerNpn ?? null,
        isPartnerGroup: true,
        memberIds: members.map((member) => member.id),
        members,
        children,
      };
    }

    // Mark every person before descending so malformed referral cycles terminate.
    mergedIntoGroup.add(agent.id);
    const children = (childrenByReferrer.get(agent.id) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toNode)
      .filter((node): node is AssistHierarchyNode => node !== null);
    const referrer = agent.referrerId ? byId.get(agent.referrerId) : null;

    return {
      id: agent.id,
      name: agent.name,
      npn: agent.npn,
      referrerName: referrer?.name ?? agent.referrerName ?? null,
      referrerNpn: referrer?.npn ?? null,
      children,
    };
  };

  if (rootUserId) {
    const root = byId.get(rootUserId);
    if (!root) return [];
    const node = toNode(root);
    return node ? [node] : [];
  }

  const roots = agents.filter(
    (agent) => !agent.referrerId || !byId.has(agent.referrerId),
  );

  return roots
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toNode)
    .filter((node): node is AssistHierarchyNode => node !== null);
}
