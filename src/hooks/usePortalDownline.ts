import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  listPortalDownline,
  type DownlineListResponse,
  type DownlineMember,
} from "@/lib/portal-downline";

export function usePortalDownline() {
  const { session, loading: authLoading } = useAuth();
  const [data, setData] = useState<DownlineListResponse>({ members: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setData({ members: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const next = await listPortalDownline(token);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load team");
      setData({ members: [] });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  return {
    members: data.members as DownlineMember[],
    loading: loading || authLoading,
    error,
    reload,
  };
}
