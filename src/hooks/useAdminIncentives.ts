import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  deleteIncentive,
  listIncentives,
  reorderIncentives,
  upsertIncentive,
  type AdminIncentiveSummary,
  type UpsertIncentivePayload,
} from "@/lib/admin-api";

export function useAdminIncentives() {
  const { session } = useAuth();
  const [incentives, setIncentives] = useState<AdminIncentiveSummary[]>([]);
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
      const data = await listIncentives(token);
      setIncentives(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load incentives");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (input: UpsertIncentivePayload) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await upsertIncentive(token, input);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  const remove = useCallback(async (id: string) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await deleteIncentive(token, id);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  const reorder = useCallback(async (orderedIds: string[]) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await reorderIncentives(token, orderedIds);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  return { incentives, loading, error, reload, save, remove, reorder };
}

export type { AdminIncentiveSummary };
