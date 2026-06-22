import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPortalIncentives,
  type PortalIncentive,
} from "@/lib/portal-incentives";

export function usePortalIncentives() {
  const { session, loading: authLoading } = useAuth();
  const [incentives, setIncentives] = useState<PortalIncentive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setIncentives([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortalIncentives(token);
      setIncentives(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load incentives");
      setIncentives([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  return { incentives, loading: loading || authLoading, error, reload };
}
