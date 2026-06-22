import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPortalTodos,
  type PortalTodo,
} from "@/lib/portal-todos";

export function usePortalTodos() {
  const { session, loading: authLoading } = useAuth();
  const [todos, setTodos] = useState<PortalTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setTodos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortalTodos(token);
      setTodos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load to-dos");
      setTodos([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  return { todos, loading: loading || authLoading, error, reload };
}
