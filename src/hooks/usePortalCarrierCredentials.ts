import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPortalCarrierCredentials,
  upsertPortalCarrierCredential,
  type CarrierCredentialItem,
  type UpsertCarrierCredentialInput,
} from "@/lib/portal-carrier-credentials";

export function usePortalCarrierCredentials() {
  const { session, loading: authLoading } = useAuth();
  const [credentials, setCredentials] = useState<CarrierCredentialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setCredentials([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortalCarrierCredentials(token);
      setCredentials(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load carrier credentials");
      setCredentials([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  const save = useCallback(
    async (input: UpsertCarrierCredentialInput) => {
      const token = session?.access_token;
      if (!token) {
        throw new Error("Not authenticated");
      }
      await upsertPortalCarrierCredential(token, input);
      await reload();
    },
    [reload, session?.access_token],
  );

  return { credentials, loading: loading || authLoading, error, reload, save };
}
