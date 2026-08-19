export interface AssistHierarchyMember {
  id: string;
  name: string;
  npn: string | null;
  referrerName: string | null;
  referrerNpn: string | null;
}

export interface AssistHierarchyNode extends AssistHierarchyMember {
  children: AssistHierarchyNode[];
  isPartnerGroup?: boolean;
  memberIds?: string[];
  members?: AssistHierarchyMember[];
}

export interface HierarchyFocusOption {
  id: string;
  name: string;
  npn: string | null;
}

interface AssistHierarchyMemberSource extends AssistHierarchyMember {
  email?: unknown;
  referrerEmail?: unknown;
  compLevel?: unknown;
  phoneNumber?: unknown;
  credentials?: unknown;
  documents?: unknown;
  bankAccount?: unknown;
}

interface AssistHierarchyNodeSource extends AssistHierarchyMemberSource {
  children: AssistHierarchyNodeSource[];
  isPartnerGroup?: boolean;
  memberIds?: string[];
  members?: AssistHierarchyMemberSource[];
}

interface HierarchyFocusOptionSource extends HierarchyFocusOption {
  email?: unknown;
}

function sanitizeMember(member: AssistHierarchyMemberSource): AssistHierarchyMember {
  return {
    id: member.id,
    name: member.name,
    npn: member.npn,
    referrerName: member.referrerName,
    referrerNpn: member.referrerNpn,
  };
}

function sanitizeNode(node: AssistHierarchyNodeSource): AssistHierarchyNode {
  return {
    ...sanitizeMember(node),
    ...(node.isPartnerGroup ? { isPartnerGroup: true } : {}),
    ...(node.memberIds ? { memberIds: [...node.memberIds] } : {}),
    ...(node.members ? { members: node.members.map(sanitizeMember) } : {}),
    children: node.children.map(sanitizeNode),
  };
}

/**
 * Allowlist serializer for the reduced, read-only admin-assist hierarchy.
 * Keep this boundary explicit so future full-admin fields cannot leak into the response.
 */
export function buildAdminAssistHierarchyResponse({
  tree,
  focusOptions,
  totalAgents,
}: {
  tree: AssistHierarchyNodeSource[];
  focusOptions: HierarchyFocusOptionSource[];
  totalAgents: number;
}): {
  tree: AssistHierarchyNode[];
  focusOptions: HierarchyFocusOption[];
  totalAgents: number;
  readOnly: true;
} {
  return {
    tree: tree.map(sanitizeNode),
    focusOptions: focusOptions.map(({ id, name, npn }) => ({ id, name, npn })),
    totalAgents,
    readOnly: true,
  };
}
