import type { PortalCarrier } from "@/lib/portal-carriers";

export const CARRIER_APPLICATIONS_TODO_ID = "carrier_applications";

type CarrierSection = {
  title: string;
  carrierNames: string[];
};

function groupCarriersBySection(carriers: PortalCarrier[]): CarrierSection[] {
  const sections: CarrierSection[] = [];
  const sectionIndexes = new Map<string, number>();

  for (const carrier of carriers) {
    const carrierName = carrier.carrier.trim();
    if (!carrierName) continue;

    const title = carrier.section.trim() || "Other";
    const existingIndex = sectionIndexes.get(title);
    if (existingIndex !== undefined) {
      sections[existingIndex].carrierNames.push(carrierName);
      continue;
    }

    sectionIndexes.set(title, sections.length);
    sections.push({ title, carrierNames: [carrierName] });
  }

  return sections;
}

function formatNaturalList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** Builds the Stage 3 carrier instructions from the published, sorted carrier sheet. */
export function buildCarrierApplicationsDescription(
  carriers: PortalCarrier[],
): string | null {
  const sections = groupCarriersBySection(carriers);
  if (sections.length === 0) return null;

  const bullets = sections.map(({ title, carrierNames }) => {
    if (title.toLowerCase() === "automatic") {
      const carrierList = formatNaturalList(carrierNames);
      const verb = carrierNames.length === 1 ? "happens" : "happen";
      return `• ${carrierList} ${verb} automatically — no action needed.`;
    }

    return `• ${title}: ${carrierNames.join(", ")}`;
  });

  return ["Submit carrier applications in each SureLC account:", ...bullets].join("\n");
}
