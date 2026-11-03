import { describe, expect, it, vi } from "vitest";
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => import("pdf-lib"));
vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({ getEmailDomain: () => "thepncl.com" }));
import { matchesIcaInitials, suggestedIcaInitials, validateIcaLegalName } from "../../supabase/functions/_shared/icaSigningRules";
import { validateSubmitOnboardingContractPayload } from "../../supabase/functions/_shared/onboardingContract";
import { validateExtractedIcaFormValues } from "@/lib/ica-acroform";

const payload = {
  legalName: "Alex Morgan", personalEmail: "alex@example.invalid", signatureName: "Alex Morgan",
  signatureImageBase64: "data:image/png;base64,dGVzdA==", agreementAccepted: true, counselAcknowledged: true,
  debitCheckInitials: { a: "AM", b: "AM", c: "AM", d: "AM", e: "AM" },
};
describe("ICA full-name and actual-initials requirements", () => {
  it.each(["A M", "Alex M", "A Morgan", "Alex", "___ ___"])("rejects %s as a full legal name in both flows", name => {
    const input = { ...payload, legalName: name, signatureName: name };
    expect(validateExtractedIcaFormValues(input, payload.signatureImageBase64)).toMatch(/full legal first and last name/);
    expect(() => validateSubmitOnboardingContractPayload(input)).toThrow(/full legal first and last name/);
    expect(() => validateSubmitOnboardingContractPayload(input, true)).toThrow(/full legal first and last name/);
  });
  it.each(["YES", "A", "B", "C", "D", "ABCDE", "ZZ"])("rejects unrelated initials %s before submission and on the server", initial => {
    const input = { ...payload, debitCheckInitials: { ...payload.debitCheckInitials, c: initial } };
    expect(validateExtractedIcaFormValues(input, payload.signatureImageBase64)).toMatch(/statement C.*actual initials/);
    expect(() => validateSubmitOnboardingContractPayload(input)).toThrow(/initial C.*actual initials/);
  });
  it("normalizes actual initials and requires all five statements", () => {
    const input = { ...payload, debitCheckInitials: { ...payload.debitCheckInitials, a: "a.m." } };
    expect(validateExtractedIcaFormValues(input, payload.signatureImageBase64)).toBeNull();
    expect(validateSubmitOnboardingContractPayload(input).debitCheckInitials.a).toBe("AM");
    expect(validateExtractedIcaFormValues({ ...input, debitCheckInitials: { ...input.debitCheckInitials, e: "" } }, payload.signatureImageBase64)).toMatch(/statement E/);
  });
  it("accepts optional middle initials, accents, hyphenated names and suffixes", () => {
    const name = "José Luis Smith-Jones Jr.";
    expect(validateIcaLegalName(name)).toBeNull();
    expect(suggestedIcaInitials(name)).toBe("JS");
    for (const initials of ["JS", "JLS", "JSJ", "JLSJ"]) expect(matchesIcaInitials(initials, name)).toBe(true);
    expect(matchesIcaInitials("JL", name)).toBe(false);
    expect(matchesIcaInitials("JE", name)).toBe(false);
    expect(matchesIcaInitials("JO", "Jane O’Neill")).toBe(true);
    expect(matchesIcaInitials("EO", "Élodie O’Neill")).toBe(true);
  });
  it("keeps the signature-name match requirement and does not invent initials fields for custom PDFs", () => {
    expect(() => validateSubmitOnboardingContractPayload({ ...payload, signatureName: "Someone Else" })).toThrow(/match your legal name/);
    expect(validateSubmitOnboardingContractPayload({ ...payload, debitCheckInitials: undefined }, true)).toMatchObject({ legalName: "Alex Morgan", debitCheckInitials: { a: "", b: "", c: "", d: "", e: "" } });
  });
});
