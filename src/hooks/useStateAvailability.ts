import { useCallback, useEffect, useState } from "react";
import {
  fetchStateAvailability,
  type StateAvailability,
} from "@/lib/portal-state-availability";

export function useStateAvailability() {
  const [states, setStates] = useState<StateAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStates(await fetchStateAvailability());
    } catch (err) {
      setStates([]);
      setError(err instanceof Error ? err.message : "Unable to load state availability.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { states, loading, error, reload };
}
