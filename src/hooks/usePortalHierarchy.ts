import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getPortalHierarchy, type PortalHierarchyResponse } from "@/lib/portal-hierarchy";

export function usePortalHierarchy(enabled = true) {
  const { session, loading: authLoading } = useAuth();
  const token = session?.access_token;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    token?: string;
    data: PortalHierarchyResponse | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  const reload = useCallback(async () => {
    request.current?.abort();
    if (!enabled || authLoading || !token) {
      setState({ token, data: null, loading: Boolean(authLoading), error: null });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState({ token, data: null, loading: true, error: null });
    try {
      const data = await getPortalHierarchy(token, controller.signal);
      if (!controller.signal.aborted) setState({ token, data, loading: false, error: null });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({ token, data: null, loading: false, error: error instanceof Error ? error.message : "Unable to load hierarchy" });
      }
    }
  }, [authLoading, enabled, token]);

  useEffect(() => {
    void reload();
    return () => request.current?.abort();
  }, [reload]);

  const current = enabled && state.token === token;
  return {
    data: current ? state.data : null,
    loading: Boolean(authLoading) || (enabled && Boolean(token) && (!current || state.loading)),
    error: current ? state.error : null,
    reload,
  };
}
