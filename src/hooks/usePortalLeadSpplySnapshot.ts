import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchLeadSpplySnapshot, type LeadSpplySnapshot } from "@/lib/portal-leadspply-snapshot";

export function usePortalLeadSpplySnapshot(userId: string | undefined) {
  const { session, loading: authLoading } = useAuth();
  const [snapshot, setSnapshot] = useState<LeadSpplySnapshot | null>(null);
  const [snapshotOwnerId, setSnapshotOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const tokenRef = useRef<string | undefined>(session?.access_token);
  tokenRef.current = session?.access_token;
  const sessionUserId = session?.user?.id;
  const hasMatchingSession = Boolean(userId && sessionUserId === userId);

  const reload = useCallback(async () => {
    const requestId = ++request.current;
    controller.current?.abort();
    const token = tokenRef.current;
    if (!userId || sessionUserId !== userId || !token) {
      setSnapshot(null);
      setSnapshotOwnerId(null);
      setError(null);
      setLoading(false);
      return;
    }

    const nextController = new AbortController();
    controller.current = nextController;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLeadSpplySnapshot(token, nextController.signal);
      if (request.current === requestId && !nextController.signal.aborted) {
        setSnapshot(result);
        setSnapshotOwnerId(userId);
      }
    } catch (err) {
      if (nextController.signal.aborted || request.current !== requestId) return;
      setSnapshot(null);
      setSnapshotOwnerId(null);
      setError(err instanceof Error ? err.message : "Unable to load LeadSpply data.");
    } finally {
      if (request.current === requestId && !nextController.signal.aborted) setLoading(false);
    }
  }, [sessionUserId, userId]);

  useEffect(() => {
    setSnapshot(null);
    setSnapshotOwnerId(null);
    setError(null);
    if (authLoading) return;
    void reload();
  }, [authLoading, reload, sessionUserId, userId]);

  useEffect(() => () => controller.current?.abort(), []);

  const visibleSnapshot = hasMatchingSession && snapshotOwnerId === userId ? snapshot : null;
  return {
    snapshot: visibleSnapshot,
    loading: loading || authLoading || (hasMatchingSession && !visibleSnapshot && !error),
    error: hasMatchingSession ? error : null,
    reload,
  };
}
