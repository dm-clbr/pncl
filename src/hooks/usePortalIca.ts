import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPortalIcaStatus,
  type PortalIcaStatus,
  type PortalIcaSummary,
} from "@/lib/portal-ica";

export function usePortalIca() {
  const { user, session, loading: authLoading } = useAuth();
  const [ica, setIca] = useState<PortalIcaSummary | null>(null);
  const [icaSource, setIcaSource] = useState<PortalIcaStatus["source"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresResign, setRequiresResign] = useState(false);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!user?.id || !token) {
      setIca(null);
      setIcaSource(null);
      setRequiresResign(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const status = await fetchPortalIcaStatus(token);
      setIca(status.ica);
      setIcaSource(status.source);
      setRequiresResign(status.requiresResign === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load agreement");
      setIca(null);
      setIcaSource(null);
      setRequiresResign(false);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  const signed = Boolean(ica);

  return {
    ica,
    icaSource,
    submitted: signed,
    signed,
    loading: loading || authLoading,
    error,
    requiresResign,
    reload,
    setIca,
  };
}
