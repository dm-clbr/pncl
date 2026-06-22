import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  deleteBrandAsset,
  listBrandAssets,
  reorderBrandAssets,
  upsertBrandAsset,
  type AdminBrandAssetSummary,
  type UpsertBrandAssetPayload,
} from "@/lib/admin-api";

export function useAdminBrandAssets() {
  const { session } = useAuth();
  const [assets, setAssets] = useState<AdminBrandAssetSummary[]>([]);
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
      const data = await listBrandAssets(token);
      setAssets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load brand assets");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (input: UpsertBrandAssetPayload) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await upsertBrandAsset(token, input);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  const remove = useCallback(async (id: string) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await deleteBrandAsset(token, id);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  const reorder = useCallback(async (orderedIds: string[]) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const result = await reorderBrandAssets(token, orderedIds);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  return { assets, loading, error, reload, save, remove, reorder };
}

export type { AdminBrandAssetSummary };
