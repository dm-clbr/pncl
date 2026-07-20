import { describe, expect, it } from "vitest";
import { lookupCountyFromZip, requireCountyFromZip } from "./us-zip-county";

describe("us-zip-county", () => {
  it("looks up county from a valid ZIP", async () => {
    await expect(lookupCountyFromZip("90210")).resolves.toBe("Los Angeles");
    await expect(lookupCountyFromZip("90210-1234")).resolves.toBe("Los Angeles");
  });

  it("returns null for invalid ZIP input", async () => {
    await expect(lookupCountyFromZip("1234")).resolves.toBeNull();
    await expect(lookupCountyFromZip("")).resolves.toBeNull();
  });

  it("throws when county cannot be resolved", async () => {
    await expect(requireCountyFromZip("00000")).rejects.toThrow(/Unable to determine county/i);
  });
});
