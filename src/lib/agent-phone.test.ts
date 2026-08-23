import {
  formatAgentPhoneInput,
  isValidAgentPhoneNumber,
  requireValidAgentPhoneNumber,
} from "@/lib/agent-phone";

describe("agent profile phone", () => {
  it("formats a 10-digit US phone number consistently", () => {
    expect(formatAgentPhoneInput("(555) 555-0100 ext 9")).toBe("555-555-0100");
    expect(formatAgentPhoneInput("+1 (555) 555-0100")).toBe("555-555-0100");
    expect(formatAgentPhoneInput("55555")).toBe("555-55");
    expect(isValidAgentPhoneNumber("555-555-0100")).toBe(true);
  });

  it("rejects missing or incomplete phone numbers", () => {
    expect(isValidAgentPhoneNumber("")).toBe(false);
    expect(isValidAgentPhoneNumber("000-000-0000")).toBe(false);
    expect(() => requireValidAgentPhoneNumber("555-0100")).toThrow(/10-digit/i);
    expect(() => requireValidAgentPhoneNumber("000-000-0000")).toThrow(/10-digit/i);
  });
});
