import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPortalCarriers, type PortalCarrier } from "@/lib/portal-carriers";

export function usePortalCarriers() {
  const { session, loading: authLoading } = useAuth();
  const [carriers, setCarriers] = useState<PortalCarrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setCarriers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortalCarriers(token);
      setCarriers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load carriers");
      setCarriers([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  return { carriers, loading: loading || authLoading, error, reload };
}
