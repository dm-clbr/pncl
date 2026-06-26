import { describe, expect, it } from "vitest";
import { parseCityStateZip } from "@/lib/w9-acroform";

describe("parseCityStateZip", () => {
  it("parses city, state, and ZIP from a combined line", () => {
    expect(parseCityStateZip("Scottsdale, AZ 85260")).toEqual({
      city: "Scottsdale",
      state: "AZ",
      zip: "85260",
    });
  });

  it("parses ZIP+4", () => {
    expect(parseCityStateZip("Scottsdale, AZ 85260-5003")).toEqual({
      city: "Scottsdale",
      state: "AZ",
      zip: "85260-5003",
    });
  });
});
