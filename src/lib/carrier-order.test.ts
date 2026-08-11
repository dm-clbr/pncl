import { describe, expect, it } from "vitest";
import { moveCarrierIntoAdjacentSection } from "@/lib/carrier-order";

type Carrier = {
  id: string;
  section: string;
};

const carriers: Carrier[] = [
  { id: "mutual-of-omaha", section: "SureLC #1" },
  { id: "transamerica", section: "SureLC #1" },
  { id: "banner", section: "SureLC #2" },
  { id: "fidelity-and-guaranty", section: "SureLC #2" },
];

describe("moveCarrierIntoAdjacentSection", () => {
  it("moves a carrier down into the next section without taking its old section label", () => {
    const result = moveCarrierIntoAdjacentSection(carriers, 1, 1);

    expect(result).toEqual([
      { id: "mutual-of-omaha", section: "SureLC #1" },
      { id: "banner", section: "SureLC #2" },
      { id: "transamerica", section: "SureLC #2" },
      { id: "fidelity-and-guaranty", section: "SureLC #2" },
    ]);
  });

  it("moves a carrier up into the previous section without taking its old section label", () => {
    const result = moveCarrierIntoAdjacentSection(carriers, 2, -1);

    expect(result).toEqual([
      { id: "mutual-of-omaha", section: "SureLC #1" },
      { id: "banner", section: "SureLC #1" },
      { id: "transamerica", section: "SureLC #1" },
      { id: "fidelity-and-guaranty", section: "SureLC #2" },
    ]);
  });

  it("keeps the shared section when reordering within one section", () => {
    const result = moveCarrierIntoAdjacentSection(carriers, 0, 1);

    expect(result.slice(0, 2)).toEqual([
      { id: "transamerica", section: "SureLC #1" },
      { id: "mutual-of-omaha", section: "SureLC #1" },
    ]);
  });
});
