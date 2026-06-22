import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  deletePortalTodo,
  listPortalTodos,
  reorderPortalTodos,
  upsertPortalTodo,
  type AdminPortalTodoSummary,
  type UpsertPortalTodoPayload,
} from "@/lib/admin-api";

export function useAdminTodos() {
  const { session } = useAuth();
  const [todos, setTodos] = useState<AdminPortalTodoSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
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
      const data = await listPortalTodos(token);
      setTodos(data.todos);
      setTotalUsers(data.totalUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load to-dos");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (input: UpsertPortalTodoPayload) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await upsertPortalTodo(token, input);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  const remove = useCallback(async (id: string) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await deletePortalTodo(token, id);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  const reorder = useCallback(async (orderedIds: string[]) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await reorderPortalTodos(token, orderedIds);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  return { todos, totalUsers, loading, error, reload, save, remove, reorder };
}

export type { AdminPortalTodoSummary };
