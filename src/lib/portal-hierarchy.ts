import type { AgentPhase, AssistHierarchyNode, HierarchyFocusOption, HierarchyNode } from "@/lib/admin-api";
import { getSupabaseConfig } from "@/lib/supabase";

export interface PortalHierarchyResponse {
  tree: AssistHierarchyNode[];
  focusOptions: HierarchyFocusOption[];
  totalAgents: number;
  readOnly: true;
  people: PortalHierarchyPerson[];
}

export interface PortalHierarchyPerson {
  id: string;
  compLevel: number | null;
  compLevelEffectiveAt: string | null;
  phase: AgentPhase | null;
  profilePhotoPath: string | null;
  profileUpdatedAt: string | null;
}

export function countHierarchyPeople(tree: AssistHierarchyNode[]): number {
  return tree.reduce((sum, node) => sum + (node.members?.length ?? 1) + countHierarchyPeople(node.children), 0);
}

export function toPortalCanvasTree(tree: AssistHierarchyNode[], people: PortalHierarchyPerson[], levels = Infinity): HierarchyNode[] {
  const byId = new Map(people.map((person) => [person.id, person]));
  const personFields = (id: string) => ({
    email: "", role: "agent" as const, status: byId.get(id)?.phase ?? null,
    compLevel: byId.get(id)?.compLevel ?? null,
    compLevelEffectiveAt: byId.get(id)?.compLevelEffectiveAt ?? null,
    profilePhotoPath: byId.get(id)?.profilePhotoPath ?? null,
    profileUpdatedAt: byId.get(id)?.profileUpdatedAt ?? null,
  });
  const walk = (nodes: AssistHierarchyNode[], depth: number): HierarchyNode[] => nodes.map((node) => ({
    ...personFields(node.id), id: node.id, name: node.name,
    isPartnerGroup: node.isPartnerGroup, memberIds: node.memberIds,
    members: node.members?.map((member) => ({ ...personFields(member.id), id: member.id, name: member.name, npn: member.npn })),
    children: depth < levels ? walk(node.children, depth + 1) : [],
  }));
  return walk(tree, 1);
}

export async function getPortalHierarchy(
  accessToken: string,
  signal?: AbortSignal,
): Promise<PortalHierarchyResponse> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/get-portal-hierarchy`, {
    method: "GET",
    signal,
    headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Unable to load your team hierarchy");
  return data;
}
