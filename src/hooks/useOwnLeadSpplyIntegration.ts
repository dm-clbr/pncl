import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { manageLeadSpplyIntegration, type OwnIntegrationStatus } from "@/lib/portal-leadspply-integration";

export function useOwnLeadSpplyIntegration() {
  const { session, user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<OwnIntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const owner = useRef<string | null>(null);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const userId = user?.id;
  const sessionUserId = session?.user?.id;
  const tokenRef = useRef(session?.access_token);
  tokenRef.current = session?.access_token;

  const reload = useCallback(async () => {
    const requestId = ++request.current;
    controller.current?.abort();
    const token = tokenRef.current;
    if (!userId || userId !== sessionUserId || !token) { setStatus(null); owner.current = null; setLoading(false); return; }
    const next = new AbortController(); controller.current = next;
    setLoading(true); setError(null);
    try {
      const result = await manageLeadSpplyIntegration<OwnIntegrationStatus>(token, { action: "status" }, next.signal);
      if (request.current === requestId && !next.signal.aborted) { owner.current = userId; setStatus(result); }
    } catch (err) {
      if (next.signal.aborted || request.current !== requestId) return;
      owner.current = null; setStatus(null); setError(err instanceof Error ? err.message : "Unable to load the LeadSpply connection.");
    } finally { if (request.current === requestId && !next.signal.aborted) setLoading(false); }
  }, [sessionUserId, userId]);

  useEffect(() => { setStatus(null); owner.current = null; setError(null); if (!authLoading) void reload(); }, [authLoading, reload]);
  useEffect(() => () => controller.current?.abort(), []);
  const visible = userId && userId === sessionUserId && owner.current === userId ? status : null;
  return { status: visible, loading: loading || authLoading || Boolean(userId && !visible && !error), error: userId === sessionUserId ? error : null, reload };
}
