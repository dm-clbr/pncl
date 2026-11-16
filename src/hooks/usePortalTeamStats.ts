import { useCallback } from "react";
import { getPortalTeamStats, type PortalTeamStats, type TeamStatsPeriod } from "@/lib/portal-team-stats";
import { createPortalTeamCache } from "@/lib/portal-team-cache";
import { usePortalTeamRequest } from "./usePortalTeamRequest";

const cache = createPortalTeamCache<PortalTeamStats | null>();
export function usePortalTeamStats(period: TeamStatsPeriod, enabled = true) {
  const load = useCallback((token: string, signal: AbortSignal) => getPortalTeamStats(token, period, signal), [period]);
  return usePortalTeamRequest(cache, period, load, enabled);
}
