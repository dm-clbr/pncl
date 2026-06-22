import { useCallback, useEffect, useState } from "react";
import { listAdminClients, type AdminClientSummary } from "@/lib/admin-api";

export function useAdminClients(accessToken: string | undefined) {
  const [clients, setClients] = useState<AdminClientSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(accessToken));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken) {
      setClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextClients = await listAdminClients(accessToken);
      setClients(nextClients);
    } catch (err) {
      setClients([]);
      setError(err instanceof Error ? err.message : "Unable to load clients");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { clients, loading, error, reload };
}
