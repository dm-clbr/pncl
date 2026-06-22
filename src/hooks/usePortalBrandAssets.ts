import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPortalBrandAssets,
  type PortalBrandAsset,
} from "@/lib/portal-brand-assets";

export function usePortalBrandAssets() {
  const { session, loading: authLoading } = useAuth();
  const [assets, setAssets] = useState<PortalBrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setAssets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortalBrandAssets(token);
      setAssets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load brand assets");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  return { assets, loading: loading || authLoading, error, reload };
}
