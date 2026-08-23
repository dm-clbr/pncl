import {
  isPortalProfileContractComplete,
  validatePortalProfileContractFields,
  type PortalProfileFormValues,
} from "@/lib/portal-profile";

const COMPLETE_PROFILE = {
  first_name: "Avery",
  last_name: "Rivera",
  phone_number: "555-555-0100",
  address_line1: "123 Main St",
  address_city: "Salt Lake City",
  address_state: "UT",
  address_zip: "84101",
  county: "Salt Lake",
};

const COMPLETE_FORM: PortalProfileFormValues = {
  firstName: "Avery",
  lastName: "Rivera",
  phoneNumber: "555-555-0100",
  shirtSize: "",
  poloShirtSize: "",
  hoodieSize: "",
  waistSize: "",
  shoeSize: "",
  addressLine1: "123 Main St",
  addressCity: "Salt Lake City",
  addressState: "UT",
  addressZip: "84101",
};

describe("portal profile completion", () => {
  it("requires a valid saved phone number", () => {
    expect(isPortalProfileContractComplete(COMPLETE_PROFILE)).toBe(true);
    expect(isPortalProfileContractComplete({ ...COMPLETE_PROFILE, phone_number: null })).toBe(false);
    expect(isPortalProfileContractComplete({ ...COMPLETE_PROFILE, phone_number: "555-0100" })).toBe(false);
  });

  it("validates phone before an own-profile update", () => {
    expect(() => validatePortalProfileContractFields(COMPLETE_FORM)).not.toThrow();
    expect(() => validatePortalProfileContractFields({ ...COMPLETE_FORM, phoneNumber: "" }))
      .toThrow(/phone number is required/i);
  });
});
