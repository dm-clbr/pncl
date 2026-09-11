import { describe, expect, it } from "vitest";
import { validateExtractedIcaFormValues } from "@/lib/ica-acroform";

const COMPLETE_ICA = {
  legalName: "Avery Rivera",
  personalEmail: "avery.personal@example.com",
  signatureName: "Avery Rivera",
  debitCheckInitials: { a: "AR", b: "AR", c: "AR", d: "AR", e: "AR" },
};

describe("ICA recovery-email entry", () => {
  it("accepts a personal address on the ICA", () => {
    expect(validateExtractedIcaFormValues(COMPLETE_ICA)).toBeNull();
  });

  it("blocks a PNCL Workspace address before either ICA form is submitted", () => {
    expect(validateExtractedIcaFormValues({
      ...COMPLETE_ICA,
      personalEmail: "avery@thepncl.com",
    })).toMatch(/personal email/i);
  });

  it("blocks the legacy dm placeholder before either ICA form is submitted", () => {
    expect(validateExtractedIcaFormValues({
      ...COMPLETE_ICA,
      personalEmail: "dm@thepncl.com",
    })).toMatch(/placeholder/i);
  });
});
