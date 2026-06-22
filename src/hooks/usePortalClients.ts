import { useCallback, useEffect, useState } from "react";
import { listPortalClients, type PortalClientRecord } from "@/lib/client-intake";

export function usePortalClients(userId: string | undefined) {
  const [clients, setClients] = useState<PortalClientRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) {
      setClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextClients = await listPortalClients(userId);
      setClients(nextClients);
    } catch (err) {
      setClients([]);
      setError(err instanceof Error ? err.message : "Unable to load clients");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { clients, loading, error, reload };
}
