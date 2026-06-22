import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_PORTAL_INCENTIVES,
  fetchPortalIncentives,
  type PortalIncentive,
} from "@/lib/portal-incentives";

export function usePortalIncentives() {
  const { session } = useAuth();
  const [incentives, setIncentives] = useState<PortalIncentive[]>(DEFAULT_PORTAL_INCENTIVES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!session?.access_token) {
      setIncentives(DEFAULT_PORTAL_INCENTIVES);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortalIncentives();
      setIncentives(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load incentives");
      setIncentives(DEFAULT_PORTAL_INCENTIVES);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { incentives, loading, error, reload };
}
