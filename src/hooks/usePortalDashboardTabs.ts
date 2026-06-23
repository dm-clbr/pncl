import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPortalDashboardTabs, type PortalDashboardSection } from "@/lib/portal-dashboard-tabs";
import { mergeSystemDashboardSections } from "@/lib/portal-dashboard-section-types";

export function usePortalDashboardTabs() {
  const { session } = useAuth();
  const [sections, setSections] = useState<PortalDashboardSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setSections([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortalDashboardTabs(token);
      setSections(
        mergeSystemDashboardSections(data, (def, sortOrder) => ({
          id: def.id,
          title: def.title,
          sectionType: def.sectionType,
          sortOrder,
          links: [],
          files: [],
        })),
      );
    } catch (err) {
      setSections([]);
      setError(err instanceof Error ? err.message : "Unable to load dashboard tabs");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { sections, loading, error, reload };
}
