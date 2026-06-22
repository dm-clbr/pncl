export type PortalDashboardSectionType = "links" | "incentives" | "brand_assets";

export const SYSTEM_DASHBOARD_SECTION_IDS = new Set(["incentives", "brand-assets"]);

export const DEFAULT_SYSTEM_DASHBOARD_SECTIONS = [
  { id: "incentives", title: "Incentives", sectionType: "incentives" as const },
  { id: "brand-assets", title: "Brand assets", sectionType: "brand_assets" as const },
] as const;

export function isLinksDashboardSection(section: { sectionType: PortalDashboardSectionType }): boolean {
  return section.sectionType === "links";
}

export function isSystemDashboardSection(section: { id: string }): boolean {
  return SYSTEM_DASHBOARD_SECTION_IDS.has(section.id);
}

export function normalizeDashboardSectionType(
  section: { id: string; sectionType?: PortalDashboardSectionType | string | null },
): PortalDashboardSectionType {
  if (section.sectionType === "incentives" || section.id === "incentives") {
    return "incentives";
  }
  if (section.sectionType === "brand_assets" || section.id === "brand-assets") {
    return "brand_assets";
  }
  return "links";
}

export function mergeSystemDashboardSections<T extends {
  id: string;
  title: string;
  sectionType?: PortalDashboardSectionType | string | null;
  sortOrder?: number;
}>(
  sections: T[],
  createMissing: (def: (typeof DEFAULT_SYSTEM_DASHBOARD_SECTIONS)[number], sortOrder: number) => T,
): T[] {
  const merged = sections.map((section) => ({
    ...section,
    sectionType: normalizeDashboardSectionType(section),
  }));

  for (const def of DEFAULT_SYSTEM_DASHBOARD_SECTIONS) {
    if (!merged.some((section) => section.id === def.id)) {
      merged.push(createMissing(def, merged.length));
    }
  }

  return merged.sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
}
