import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getPortalTeamStats, type PortalTeamStats, type TeamStatsPeriod } from "@/lib/portal-team-stats";

export function usePortalTeamStats(period: TeamStatsPeriod, enabled = true) {
  const { session, loading: authLoading } = useAuth();
  const token = session?.access_token;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    token?: string;
    period?: TeamStatsPeriod;
    data: PortalTeamStats | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  const reload = useCallback(async () => {
    request.current?.abort();
    if (!enabled || authLoading || !token) {
      setState({ token, period, data: null, loading: Boolean(authLoading), error: null });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState({ token, period, data: null, loading: true, error: null });
    try {
      const data = await getPortalTeamStats(token, period, controller.signal);
      if (!controller.signal.aborted) setState({ token, period, data, loading: false, error: null });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({ token, period, data: null, loading: false, error: error instanceof Error ? error.message : "Unable to load LeadSpply stats" });
      }
    }
  }, [authLoading, enabled, token, period]);

  useEffect(() => {
    void reload();
    return () => request.current?.abort();
  }, [reload]);

  const current = enabled && state.token === token && state.period === period;
  return {
    data: current ? state.data : null,
    loading: Boolean(authLoading) || (enabled && Boolean(token) && (!current || state.loading)),
    error: current ? state.error : null,
    reload,
  };
}
