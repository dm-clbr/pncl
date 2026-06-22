import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

import type { PortalDashboardSectionType } from "@/lib/portal-dashboard-section-types";

export interface PortalDashboardLink {
  id: string;
  title: string;
  description: string | null;
  href: string;
  external: boolean;
}

export interface PortalDashboardSection {
  id: string;
  title: string;
  sectionType: PortalDashboardSectionType;
  sortOrder?: number;
  links: PortalDashboardLink[];
}

export async function fetchPortalDashboardTabs(
  accessToken: string,
): Promise<PortalDashboardSection[]> {
  if (!isSupabaseAuthConfigured()) {
    return [];
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/list-portal-dashboard-tabs`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to load dashboard tabs");
  }

  return (data.sections ?? []) as PortalDashboardSection[];
}

export function slugifyDashboardTabId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
