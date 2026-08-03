import { describe, expect, it } from "vitest";
import { isReadyForContracting } from "@/lib/licensing-contracting";

describe("contracting readiness", () => {
  it("requires both an NPN and an uploaded E&O certificate", () => {
    expect(isReadyForContracting({ npn: "123456", eoCertificatePath: "agent/eo.pdf" })).toBe(true);
    expect(isReadyForContracting({ npn: "123456", eoCertificatePath: null })).toBe(false);
    expect(isReadyForContracting({ npn: "", eoCertificatePath: "agent/eo.pdf" })).toBe(false);
  });

  it("does not treat an E&O policy number as proof of certificate upload", () => {
    expect(isReadyForContracting({ npn: "123456" })).toBe(false);
  });
});
