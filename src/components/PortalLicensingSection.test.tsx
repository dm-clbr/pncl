import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalLicensingSection from "@/components/PortalLicensingSection";
import { saveLicensingProfile, type PortalProfile } from "@/lib/portal-profile";

vi.mock("@/lib/portal-profile", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/portal-profile")>(),
  saveLicensingProfile: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const user = { id: "agent-1" } as User;
const names = { firstName: "Test", lastName: "Agent" };
const emptyProfile: PortalProfile = {
  user_id: user.id,
  agent_number: null,
  first_name: names.firstName,
  last_name: names.lastName,
  shirt_size: null,
  polo_shirt_size: null,
  hoodie_size: null,
  waist_size: null,
  shoe_size: null,
  comp_level: null,
  profile_photo_path: null,
  npn: null,
  eo_policy_number: null,
  eo_certificate_path: null,
  state_licenses: [],
  state_license_numbers: {},
  drivers_license_path: null,
  address_line1: null,
  address_city: null,
  address_state: null,
  address_zip: null,
  county: null,
  phone_number: null,
  recovery_email: null,
  recovery_email_sync_status: null,
  recovery_email_last_synced_at: null,
  recovery_email_last_sync_error: null,
  created_at: "2026-09-25T00:00:00.000Z",
  updated_at: "2026-09-25T00:00:00.000Z",
};

describe("licensing state picker", () => {
  beforeEach(() => {
    vi.mocked(saveLicensingProfile).mockReset();
  });

  it("lets an agent add and save a new Virginia license", async () => {
    vi.mocked(saveLicensingProfile).mockResolvedValue({
      ...emptyProfile,
      state_license_numbers: { VA: "VA-123" },
    });
    render(<PortalLicensingSection user={user} profile={null} loading={false} names={names} />);

    expect(screen.getByRole("option", { name: "Virginia (VA)" })).toHaveValue("VA");
    expect(screen.getAllByRole("option")).toHaveLength(52);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "VA" } });
    fireEvent.change(screen.getByRole("textbox", { name: "License number" }), {
      target: { value: " VA-123 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add license" }));

    expect(screen.getByText("VA: VA-123")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Virginia \(VA\)/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save licensing details" }));

    await waitFor(() => expect(saveLicensingProfile).toHaveBeenCalledWith(
      user, names,
      { npn: "", eoPolicyNumber: "", stateLicenseNumbers: { VA: "VA-123" } },
      null, null, null, null,
    ));
  });

  it("keeps an existing Virginia license selectable and saves an update without losing other states", async () => {
    const profile = {
      ...emptyProfile,
      state_license_numbers: { VA: "VA-OLD", UT: "UT-123" },
    };
    const saved = {
      ...profile,
      state_license_numbers: { VA: "VA-NEW", UT: "UT-123" },
    };
    vi.mocked(saveLicensingProfile).mockResolvedValue(saved);
    const onSaved = vi.fn();
    render(<PortalLicensingSection
      user={user} profile={profile} loading={false} names={names} onSaved={onSaved}
    />);

    expect(screen.getByRole("option", { name: "Virginia (VA) — already added" })).toBeEnabled();
    expect(screen.getAllByRole("option")).toHaveLength(52);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "VA" } });
    expect(screen.getByRole("textbox", { name: "License number" })).toHaveValue("VA-OLD");
    fireEvent.change(screen.getByRole("textbox", { name: "License number" }), {
      target: { value: "VA-NEW" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update license" }));
    expect(screen.getByText("VA: VA-NEW")).toBeInTheDocument();
    expect(screen.queryByText("VA: VA-OLD")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save licensing details" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(saveLicensingProfile).toHaveBeenCalledWith(
      user, names,
      { npn: "", eoPolicyNumber: "", stateLicenseNumbers: { VA: "VA-NEW", UT: "UT-123" } },
      null, null, null, null,
    );
  });
});
