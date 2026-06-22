import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { persistDashboardTabsDraft } from "@/lib/admin-dashboard-tabs-draft";
import {
  listDashboardTabs,
  type AdminDashboardSectionSummary,
} from "@/lib/admin-api";
import { mergeSystemDashboardSections } from "@/lib/portal-dashboard-section-types";

export function useAdminDashboardTabs() {
  const { session } = useAuth();
  const [sections, setSections] = useState<AdminDashboardSectionSummary[]>([]);
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
      const data = await listDashboardTabs(token);
      setSections(
        mergeSystemDashboardSections(data, (def, sortOrder) => ({
          id: def.id,
          title: def.title,
          sectionType: def.sectionType,
          sortOrder,
          published: true,
          links: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard tabs");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persistDraft = useCallback(async (draft: AdminDashboardSectionSummary[]) => {
    const token = session?.access_token;
    if (!token) throw new Error("Not authenticated");
    await persistDashboardTabsDraft(token, draft, sections);
    await reload();
  }, [reload, sections, session?.access_token]);

  return {
    sections,
    loading,
    error,
    reload,
    persistDraft,
  };
}

export type { AdminDashboardSectionSummary };
