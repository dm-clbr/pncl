import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  deleteCarrier,
  listCarriers,
  reorderCarriers,
  upsertCarrier,
  type AdminCarrierSummary,
  type UpsertCarrierPayload,
} from "@/lib/admin-api";

export function useAdminCarriers() {
  const { session } = useAuth();
  const [carriers, setCarriers] = useState<AdminCarrierSummary[]>([]);
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
      const data = await listCarriers(token);
      setCarriers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load carriers");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (input: UpsertCarrierPayload) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await upsertCarrier(token, input);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  const remove = useCallback(async (id: string) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await deleteCarrier(token, id);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  const reorder = useCallback(async (orderedIds: string[]) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await reorderCarriers(token, orderedIds);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  return { carriers, loading, error, reload, save, remove, reorder };
}

export type { AdminCarrierSummary };
