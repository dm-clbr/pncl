import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPortalDirectDeposit, type PortalDirectDepositSummary } from "@/lib/portal-direct-deposit";

export function usePortalDirectDeposit() {
  const { user, loading: authLoading } = useAuth();
  const [directDeposit, setDirectDeposit] = useState<PortalDirectDepositSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user?.id) {
      setDirectDeposit(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortalDirectDeposit(user.id);
      setDirectDeposit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load direct deposit form");
      setDirectDeposit(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  return {
    directDeposit,
    submitted: Boolean(directDeposit),
    loading: loading || authLoading,
    error,
    reload,
    setDirectDeposit,
  };
}
