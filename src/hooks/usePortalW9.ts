import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPortalW9, type PortalW9Summary } from "@/lib/portal-w9";

export function usePortalW9() {
  const { user, loading: authLoading } = useAuth();
  const [w9, setW9] = useState<PortalW9Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user?.id) {
      setW9(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortalW9(user.id);
      setW9(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load W-9");
      setW9(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  return {
    w9,
    submitted: Boolean(w9),
    loading: loading || authLoading,
    error,
    reload,
    setW9,
  };
}
