import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalProfile from "@/pages/PortalProfile";
import type { PortalProfile as PortalProfileRow } from "@/lib/portal-profile";

const profileRow = {
  id: "profile-1",
  user_id: "agent-1",
  first_name: "Porter",
  last_name: "Gerlach",
  phone_number: "5555550100",
  recovery_email: "porter@example.com",
  address_line1: "1400 Sherman Ave",
  address_city: "Saint Paul",
  address_state: "MN",
  address_zip: "55104",
  county: "Ramsey",
  shirt_size: "L",
  polo_shirt_size: "L",
  hoodie_size: "XL",
  waist_size: "34",
  shoe_size: "11",
  agent_number: 10428,
  comp_level: 4,
  npn: "1234567",
  profile_photo_path: null,
  recovery_email_sync_status: "synced",
  updated_at: "2026-09-01T00:00:00.000Z",
} as unknown as PortalProfileRow;

let fetchResult: () => Promise<PortalProfileRow | null> = () => Promise.resolve(profileRow);
const toastError = vi.fn();

// One frozen session object: the page reloads the profile on every new `user`
// identity, so a fresh literal per render would refetch in a loop.
const authValue = {
  user: { id: "agent-1", email: "porter@thepncl.com", app_metadata: {}, user_metadata: {} },
  session: null,
  signOut: vi.fn(),
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authValue,
  isEmailConfirmed: () => true,
}));

vi.mock("@/lib/portal-profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/portal-profile")>(
    "@/lib/portal-profile",
  );
  return {
    ...actual,
    fetchPortalProfile: () => fetchResult(),
    resolveCountyForZip: () => Promise.resolve("Ramsey"),
    getProfilePhotoUrl: () => null,
  };
});

vi.mock("@/hooks/usePortalW9", () => ({
  usePortalW9: () => ({ w9: null, submitted: false, loading: false }),
}));
vi.mock("@/hooks/usePortalDirectDeposit", () => ({
  usePortalDirectDeposit: () => ({ directDeposit: null, submitted: false, loading: false }),
}));
vi.mock("@/hooks/usePortalIca", () => ({
  usePortalIca: () => ({ ica: null, submitted: false, loading: false }),
}));
vi.mock("@/hooks/usePortalTodos", () => ({
  usePortalTodos: () => ({ todos: [], loading: false, error: null, reload: vi.fn() }),
}));

vi.mock("@/components/AgentBusinessCardDownload", () => ({ default: () => <div /> }));
vi.mock("@/components/PortalCarrierCredentials", () => ({ default: () => <div /> }));
vi.mock("@/components/PortalLicensingSection", () => ({ default: () => <div /> }));
vi.mock("@/components/PortalProfileDocumentsSection", () => ({ default: () => <div /> }));
vi.mock("@/components/PortalSureLcLinks", () => ({ default: () => <div /> }));
vi.mock("@/components/PortalTeamDashboard", () => ({ default: () => <div /> }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) } }));

function renderProfile() {
  return render(
    <MemoryRouter>
      <PortalProfile />
    </MemoryRouter>,
  );
}

describe("portal profile details tab", () => {
  beforeEach(() => {
    fetchResult = () => Promise.resolve(profileRow);
    toastError.mockReset();
  });

  it("shows the loading state until the profile arrives", async () => {
    let release: (value: PortalProfileRow) => void = () => {};
    fetchResult = () => new Promise((resolve) => { release = resolve; });

    renderProfile();
    expect(screen.getByText("Loading profile...")).toBeInTheDocument();

    release(profileRow);
    expect(await screen.findByLabelText(/^First name/)).toBeInTheDocument();
  });

  it("keeps the form and reports the failure when the profile cannot be loaded", async () => {
    fetchResult = () => Promise.reject(new Error("Unable to load profile."));

    renderProfile();

    expect(await screen.findByLabelText(/^First name/)).toBeInTheDocument();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Unable to load profile."));
  });

  it("renders the populated details tab as tabs, panes and a save bar", async () => {
    renderProfile();

    expect(await screen.findByRole("tablist", { name: "Profile sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Profile details", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Carrier logins", selected: false })).toBeInTheDocument();

    for (const title of ["Profile photo", "Contact", "Address", "Apparel"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }

    expect(screen.getByLabelText(/^First name/)).toHaveValue("Porter");
    const phone = screen.getByLabelText(/^Phone number/);
    expect(phone).toHaveAttribute("type", "tel");
    expect(phone).toHaveAttribute("autocomplete", "tel");
    const zip = screen.getByLabelText(/^ZIP code/);
    expect(zip).toHaveAttribute("inputmode", "numeric");
    expect(zip).toHaveAttribute("autocomplete", "postal-code");
    expect(screen.getByLabelText(/^Personal recovery email/)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Shoe size").tagName).toBe("SELECT");
    expect(await screen.findByText("Ramsey")).toBeInTheDocument();

    // The save bar is disabled until the form differs from the saved profile.
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();

    // An edit arms it.
    const firstName = screen.getByLabelText(/^First name/);
    fireEvent.change(firstName, { target: { value: "Porters" } });
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    // A difference savePortalProfile normalises away is not a difference:
    // the trim and the lower-case have to be on both sides of the compare,
    // or the bar stays armed forever after a save.
    fireEvent.change(firstName, { target: { value: " Porter " } });
    fireEvent.change(screen.getByLabelText(/^Personal recovery email/), {
      target: { value: "Porter@Example.com" },
    });
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();

    // Sign out stays reachable on the page, never in the bottom tab bar.
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Portal sections" })).toBeInTheDocument();
  });

  it("opens the team tab panel", async () => {
    renderProfile();

    fireEvent.click(await screen.findByRole("tab", { name: "Team" }));
    expect(screen.getByRole("tabpanel", { name: "Team" })).toBeInTheDocument();
  });

  it("opens the licensing tab panel", async () => {
    renderProfile();

    fireEvent.click(await screen.findByRole("tab", { name: "Licensing" }));
    expect(screen.getByRole("tabpanel", { name: "Licensing" })).toBeInTheDocument();
  });

  it("opens the documents tab on the saved forms empty state", async () => {
    renderProfile();

    fireEvent.click(await screen.findByRole("tab", { name: "Documents" }));
    expect(screen.getByRole("heading", { name: "Saved documents" })).toBeInTheDocument();
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
  });
});
