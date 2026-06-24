import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  createReferralInvite,
  listReferralInvites,
  type ReferralInviteListResponse,
  type ReferralInviteSummary,
} from "@/lib/portal-referrals";

export function usePortalReferrals() {
  const { session, loading: authLoading } = useAuth();
  const [data, setData] = useState<ReferralInviteListResponse>({
    compLevel: null,
    compOptions: [],
    invites: [],
  });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setData({ compLevel: null, compOptions: [], invites: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const next = await listReferralInvites(token);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load referral links");
      setData({ compLevel: null, compOptions: [], invites: [] });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  const createInvite = useCallback(async (input: {
    compLevel: number;
    recipientLabel: string;
  }): Promise<ReferralInviteSummary> => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("You must be signed in to create referral links.");
    }

    setCreating(true);
    setError(null);

    try {
      const invite = await createReferralInvite(token, input);
      await reload();
      return invite;
    } finally {
      setCreating(false);
    }
  }, [reload, session?.access_token]);

  return {
    compLevel: data.compLevel,
    compOptions: data.compOptions,
    invites: data.invites,
    loading: loading || authLoading,
    creating,
    error,
    reload,
    createInvite,
  };
}
