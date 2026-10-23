import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchEditor, type EditorData } from "@/lib/onboarding-editor";
export function useOnboardingEditor() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [data, setData] = useState<EditorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchEditor(token));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load onboarding settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, loading, error, reload, token };
}
