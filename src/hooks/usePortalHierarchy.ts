import { getPortalHierarchy, type PortalHierarchyResponse } from "@/lib/portal-hierarchy";
import { createPortalTeamCache } from "@/lib/portal-team-cache";
import { usePortalTeamRequest } from "./usePortalTeamRequest";

const cache = createPortalTeamCache<PortalHierarchyResponse>();
export function usePortalHierarchy(enabled = true) {
  return usePortalTeamRequest(cache, "hierarchy", getPortalHierarchy, enabled);
}
