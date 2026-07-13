import type { AgentSummary, AssistHierarchyNode, HierarchyNode } from "@/lib/admin-api";

type HierarchyBranch = { children: HierarchyBranch[] };

export function getDescendantAgentIds(agents: AgentSummary[], userId: string): Set<string> {
  const childrenByReferrer = new Map<string, string[]>();

  for (const agent of agents) {
    if (!agent.referrerId) continue;
    const siblings = childrenByReferrer.get(agent.referrerId) ?? [];
    siblings.push(agent.id);
    childrenByReferrer.set(agent.referrerId, siblings);
  }

  const descendants = new Set<string>();

  function walk(id: string) {
    for (const childId of childrenByReferrer.get(id) ?? []) {
      descendants.add(childId);
      walk(childId);
    }
  }

  walk(userId);
  return descendants;
}

export function countTotalDownline(node: HierarchyBranch): number {
  return node.children.reduce((sum, child) => sum + 1 + countTotalDownline(child), 0);
}

export function findHierarchyNode(roots: HierarchyNode[], nodeId: string): HierarchyNode | null {
  for (const root of roots) {
    if (root.id === nodeId) return root;
    const match = findHierarchyNode(root.children, nodeId);
    if (match) return match;
  }
  return null;
}

export function findAssistHierarchyNode(
  roots: AssistHierarchyNode[],
  nodeId: string,
): AssistHierarchyNode | null {
  for (const root of roots) {
    if (root.id === nodeId) return root;
    const match = findAssistHierarchyNode(root.children, nodeId);
    if (match) return match;
  }
  return null;
}
