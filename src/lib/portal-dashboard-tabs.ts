import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

import type { PortalDashboardSectionType } from "@/lib/portal-dashboard-section-types";

export interface PortalDashboardLink {
  id: string;
  title: string;
  description: string | null;
  href: string;
  external: boolean;
}

export interface PortalDashboardFile {
  id: string;
  title: string;
  description: string | null;
  url: string;
  fileName: string;
  contentType: string;
}

export interface PortalDashboardSection {
  id: string;
  title: string;
  sectionType: PortalDashboardSectionType;
  sortOrder?: number;
  links: PortalDashboardLink[];
  files: PortalDashboardFile[];
}

/** Keep account setup discoverable with both published and fallback tiles. */
export function withAccountSetupLink(sections: PortalDashboardSection[]): PortalDashboardSection[] {
  const setup: PortalDashboardLink = {
    id: "hub-account-setup",
    title: "LeadSpply & PNCL Pay setup",
    description: "Connect and verify your accounts using your Hub email.",
    href: "/portal/leadspply",
    external: false,
  };
  const accountIndex = sections.findIndex(section => section.sectionType === "links" &&
    (section.id === "account" || section.title.trim().toLowerCase() === "account"));
  if (accountIndex === -1) return [...sections, {
    id: "account", title: "Account", sectionType: "links", links: [setup], files: [],
  }];
  return sections.map((section, index) => index === accountIndex ? {
    ...section,
    links: [...section.links.filter(link => link.id !== setup.id && link.href !== setup.href), setup],
  } : section);
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

  return (data.sections ?? []).map((section) => ({
    ...section,
    files: section.files ?? [],
  })) as PortalDashboardSection[];
}

export function slugifyDashboardTabId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
