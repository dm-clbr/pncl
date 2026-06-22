import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { listAgents, type AgentSummary } from "@/lib/admin-api";

export function useAdminAgents() {
  const { session } = useAuth();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await listAgents(token);
      setAgents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load agents");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { agents, loading, error, reload };
}
