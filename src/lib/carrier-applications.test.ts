import { describe, expect, it } from "vitest";
import {
  buildCarrierApplicationsDescription,
} from "@/lib/carrier-applications";
import type { PortalCarrier } from "@/lib/portal-carriers";

function carrier(
  id: string,
  name: string,
  section: string,
): PortalCarrier {
  return {
    id,
    carrier: name,
    companyNumber: "",
    eAppLabel: name,
    eAppUrl: null,
    section,
  };
}

describe("buildCarrierApplicationsDescription", () => {
  it("uses the saved section and carrier order", () => {
    const description = buildCarrierApplicationsDescription([
      carrier("american-amicable", "American Amicable", "SureLC #1"),
      carrier("banner", "Banner - Beyond Term", "SureLC #2"),
      carrier("transamerica", "TransAmerica", "SureLC #2"),
      carrier("foresters", "Foresters", "SureLC #3"),
    ]);

    expect(description).toBe([
      "Submit applications ONLY for the carriers listed under each separate SureLC account:",
      "• SureLC #1: American Amicable",
      "• SureLC #2: Banner - Beyond Term, TransAmerica",
      "• SureLC #3: Foresters",
    ].join("\n"));
  });

  it("places Mutual of Omaha in the section saved on the carrier sheet", () => {
    const description = buildCarrierApplicationsDescription([
      carrier("american-amicable", "American Amicable", "SureLC #1"),
      carrier("mutual-of-omaha", "Mutual of Omaha", "SureLC #3"),
      carrier("foresters", "Foresters", "SureLC #3"),
    ]);

    expect(description).toContain("• SureLC #1: American Amicable");
    expect(description).toContain("• SureLC #3: Mutual of Omaha, Foresters");
    expect(description).not.toContain("SureLC #1: American Amicable, Mutual of Omaha");
  });

  it("keeps one section bullet if matching sections are not contiguous", () => {
    const description = buildCarrierApplicationsDescription([
      carrier("first", "First", "SureLC #1"),
      carrier("second", "Second", "SureLC #2"),
      carrier("third", "Third", "SureLC #1"),
    ]);

    expect(description).toContain("• SureLC #1: First, Third");
    expect(description?.match(/SureLC #1/g)).toHaveLength(1);
  });

  it("renders automatic carriers as no-action instructions", () => {
    const description = buildCarrierApplicationsDescription([
      carrier("ethos", "Ethos", "Automatic"),
      carrier("united-home-life", "United Home Life", "Automatic"),
    ]);

    expect(description).toContain(
      "• Ethos and United Home Life: links are sent to your PNCL email automatically. No SureLC request is needed.",
    );
  });

  it("falls back to the saved to-do description when no carriers are available", () => {
    expect(buildCarrierApplicationsDescription([])).toBeNull();
  });

  it("does not send agents to SureLC for unassigned carriers or Ethos", () => {
    const description = buildCarrierApplicationsDescription([
      carrier("ethos", "Ethos", ""), carrier("gtl", "Guarantee Trust Life", ""),
      carrier("transamerica", "Transamerica", "SureLC #3"),
    ]);
    expect(description).toContain("Ethos: links are sent to your PNCL email automatically");
    expect(description).toContain("SureLC #3: Transamerica");
    expect(description).not.toContain("Guarantee Trust Life");
  });
});
