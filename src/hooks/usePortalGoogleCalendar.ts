import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  disconnectPortalGoogleCalendar,
  fetchPortalGoogleCalendar,
  startPortalGoogleCalendarOAuth,
  syncPortalGoogleCalendar,
  type DisconnectPortalGoogleCalendarResult,
  type PortalGoogleCalendarData,
} from "@/lib/portal-google-calendar";

const EMPTY_CALENDAR: PortalGoogleCalendarData = { connection: null, events: [] };

export function usePortalGoogleCalendar() {
  const { session, loading: authLoading } = useAuth();
  const [data, setData] = useState<PortalGoogleCalendarData>(EMPTY_CALENDAR);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setData(EMPTY_CALENDAR);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPortalGoogleCalendar(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Google Calendar");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload]);

  const connect = useCallback(async () => {
    const token = session?.access_token;
    if (!token) throw new Error("Your portal session expired. Sign in again.");
    setConnecting(true);
    try {
      const authorizationUrl = await startPortalGoogleCalendarOAuth(token);
      window.location.assign(authorizationUrl);
    } finally {
      setConnecting(false);
    }
  }, [session?.access_token]);

  const sync = useCallback(async () => {
    const token = session?.access_token;
    if (!token) throw new Error("Your portal session expired. Sign in again.");
    setSyncing(true);
    try {
      await syncPortalGoogleCalendar(token);
      await reload();
    } catch (err) {
      await reload();
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [reload, session?.access_token]);

  const disconnect = useCallback(async (): Promise<DisconnectPortalGoogleCalendarResult> => {
    const token = session?.access_token;
    if (!token) throw new Error("Your portal session expired. Sign in again.");
    setDisconnecting(true);
    try {
      const result = await disconnectPortalGoogleCalendar(token);
      setData(EMPTY_CALENDAR);
      setError(null);
      return result;
    } finally {
      setDisconnecting(false);
    }
  }, [session?.access_token]);

  return {
    data,
    loading: loading || authLoading,
    error,
    connecting,
    syncing,
    disconnecting,
    connect,
    sync,
    disconnect,
    reload,
  };
}
