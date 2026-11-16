import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { createPortalTeamCache } from "@/lib/portal-team-cache";

/** Reuses recent responses while keeping account changes, cancellation and retry safe. */
export function usePortalTeamRequest<T>(
  cache: ReturnType<typeof createPortalTeamCache<T>>,
  key: string,
  load: (token: string, signal: AbortSignal) => Promise<T>,
  enabled: boolean,
) {
  const { session, loading: authLoading } = useAuth();
  const token = session?.access_token;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState(() => {
    const cached = enabled && !authLoading ? cache.read(token, key) : undefined;
    return { token, key, data: cached ? cached.data : null as T | null, loading: !cached, error: null as string | null };
  });
  const run = useCallback(async (force = false) => {
    request.current?.abort();
    if (!enabled || authLoading || !token) {
      if (!token) cache.read(undefined, key);
      setState({ token, key, data: null, loading: Boolean(authLoading), error: null });
      return;
    }
    const cached = cache.read(token, key);
    if (!force && cached) {
      setState({ token, key, data: cached.data, loading: false, error: null });
      return;
    }
    cache.remove(key);
    const controller = new AbortController();
    request.current = controller;
    setState({ token, key, data: null, loading: true, error: null });
    try {
      const data = await load(token, controller.signal);
      if (!controller.signal.aborted) {
        cache.write(token, key, data);
        setState({ token, key, data, loading: false, error: null });
      }
    } catch (error) {
      if (!controller.signal.aborted) setState({ token, key, data: null, loading: false, error: error instanceof Error ? error.message : "Unable to load team data" });
    }
  }, [authLoading, cache, enabled, key, load, token]);
  useEffect(() => {
    void run();
    return () => request.current?.abort();
  }, [run]);
  const reload = useCallback(() => run(true), [run]);
  const current = enabled && state.token === token && state.key === key;
  return {
    data: current ? state.data : null,
    loading: Boolean(authLoading) || (enabled && Boolean(token) && (!current || state.loading)),
    error: current ? state.error : null,
    reload,
  };
}
