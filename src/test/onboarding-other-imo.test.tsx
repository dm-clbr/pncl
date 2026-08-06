import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminOnboardingDetailsPanel from "@/components/admin/AdminOnboardingDetailsPanel";
import { buildSubmitOnboardingRequest, type SubmitOnboardingInput } from "@/lib/onboarding-api";
import { OTHER_IMO_ONBOARDING_STEP } from "@/lib/onboarding-other-imo";
import { normalizeRequiredYesNo } from "../../supabase/functions/_shared/requiredYesNo";

const INPUT: SubmitOnboardingInput = {
  legalName: "Sample Agent",
  phoneNumber: "555-555-0100",
  dateOfBirth: "01/15/1990",
  ssn: "111-22-3333",
  stateOfResidence: "CO",
  addressLine1: "123 Main St",
  addressCity: "Denver",
  addressZip: "80202",
  driversLicense: "data:image/jpeg;base64,license",
  profilePhoto: "",
  uplineNetwork: "Sample Team",
  hasLicense: "Yes",
  npn: "12345678",
  hasEoInsurance: "No",
  hasOtherImo: "Yes",
  contractSignatureId: "00000000-0000-4000-8000-000000000000",
};

describe("other-IMO onboarding question", () => {
  it("accepts only an explicit Yes or No answer", () => {
    expect(OTHER_IMO_ONBOARDING_STEP).toMatchObject({
      type: "yesno",
      required: true,
      options: ["Yes", "No"],
    });
    expect(normalizeRequiredYesNo("Yes", "hasOtherImo")).toBe("Yes");
    expect(normalizeRequiredYesNo("No", "hasOtherImo")).toBe("No");
    expect(() => normalizeRequiredYesNo(undefined, "hasOtherImo")).toThrow("hasOtherImo must be Yes or No");
    expect(() => normalizeRequiredYesNo("", "hasOtherImo")).toThrow("hasOtherImo must be Yes or No");
  });

  it("sends the answer without collecting carrier or writing-number details", () => {
    const request = buildSubmitOnboardingRequest(INPUT);

    expect(request.hasOtherImo).toBe("Yes");
    expect(request).not.toHaveProperty("otherImoCarrier");
    expect(request).not.toHaveProperty("otherImoWritingNumber");
  });

  it("shows the persisted answer in admin onboarding details", () => {
    render(
      <AdminOnboardingDetailsPanel
        referrerName="Sample Upline"
        onboarding={{
          legalName: INPUT.legalName,
          firstName: "Sample",
          lastName: "Agent",
          phoneNumber: INPUT.phoneNumber,
          dateOfBirth: INPUT.dateOfBirth,
          ssn: null,
          stateOfResidence: INPUT.stateOfResidence,
          uplineNetwork: INPUT.uplineNetwork,
          hasLicense: INPUT.hasLicense,
          npn: INPUT.npn,
          hasEoInsurance: INPUT.hasEoInsurance,
          hasOtherImo: INPUT.hasOtherImo,
          workspaceEmail: "sample.agent@thepncl.com",
        }}
      />,
    );

    expect(screen.getByText("Contracted with another IMO").closest("div")).toHaveTextContent(
      "Contracted with another IMOYes",
    );
  });
});
