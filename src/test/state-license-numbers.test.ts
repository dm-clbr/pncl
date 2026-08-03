import { describe, expect, it } from "vitest";
import {
  licensedStatesFromNumbers,
  normalizeStateLicenseNumbers,
} from "@/lib/portal-profile";

describe("state license numbers", () => {
  it("keeps only supported states with a license number", () => {
    expect(normalizeStateLicenseNumbers({ ut: " 12345 ", TX: "", XX: "987", CO: 12 })).toEqual({
      UT: "12345",
    });
  });

  it("derives active states only from submitted license numbers", () => {
    expect(licensedStatesFromNumbers({ TX: "22", UT: "11", CO: "" })).toEqual(["TX", "UT"]);
  });
});
