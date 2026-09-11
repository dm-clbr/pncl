import { describe, expect, it } from "vitest";
import { normalizeRecoveryEmail, validateRecoveryEmail } from "@/lib/recovery-email";

describe("recovery email validation", () => {
  it("normalizes an explicitly supplied personal address", () => {
    expect(normalizeRecoveryEmail("  Agent.Personal@Example.com ")).toBe("agent.personal@example.com");
    expect(validateRecoveryEmail("  Agent.Personal@Example.com ")).toBeNull();
  });

  it("requires a syntactically valid personal address", () => {
    expect(validateRecoveryEmail("")).toMatch(/required/i);
    expect(validateRecoveryEmail("not-an-email")).toMatch(/valid/i);
  });

  it("rejects PNCL Workspace addresses", () => {
    expect(validateRecoveryEmail("agent@thepncl.com")).toMatch(/personal/i);
    expect(validateRecoveryEmail("agent@THEPNCL.COM")).toMatch(/personal/i);
  });

  it("rejects the legacy dm placeholder explicitly", () => {
    expect(validateRecoveryEmail("dm@thepncl.com")).toMatch(/placeholder/i);
    expect(validateRecoveryEmail(" DM@THEPNCL.COM ")).toMatch(/placeholder/i);
  });
});
