import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PortalLicensingSection from "@/components/PortalLicensingSection";
import PortalProfileDocumentsSection from "@/components/PortalProfileDocumentsSection";
import type { PortalProfile } from "@/lib/portal-profile";

// The page test mocks both of these components away, so the rebuilt markup is
// asserted here against the real components instead.
vi.mock("@/lib/portal-profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/portal-profile")>(
    "@/lib/portal-profile",
  );
  return {
    ...actual,
    getDriversLicenseUrl: () => Promise.resolve(null),
    getEoCertificateUrl: () => Promise.resolve(null),
  };
});

const documents = [
  {
    id: "doc-1",
    user_id: "agent-1",
    label: "AHIP certification 2026",
    file_path: "agent-1/ahip.pdf",
    mime_type: "application/pdf",
    size_bytes: 421888,
    created_at: "2026-09-08T00:00:00.000Z",
  },
];

let documentRows: typeof documents = [];

vi.mock("@/lib/portal-profile-documents", () => ({
  fetchProfileDocuments: () => Promise.resolve(documentRows),
  getProfileDocumentUrl: () => Promise.resolve(null),
  uploadProfileDocument: vi.fn(),
  deleteProfileDocument: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const licensingProfile = {
  npn: "1234567",
  eo_policy_number: "EO-88231-PNCL",
  state_license_numbers: { MN: "40512233", WI: "19022847" },
  drivers_license_path: null,
  eo_certificate_path: null,
} as unknown as PortalProfile;

const user = { id: "agent-1" } as never;

describe("portal licensing section", () => {
  it("renders the three panes, the add row and a remove target per license", () => {
    render(
      <PortalLicensingSection
        user={user}
        profile={licensingProfile}
        loading={false}
        names={{ firstName: "Porter", lastName: "Gerlach" }}
      />,
    );

    for (const title of ["Licensing numbers", "Uploads", "State licenses"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }

    expect(screen.getByLabelText(/^NPN/)).toHaveValue("1234567");
    expect(screen.getByLabelText(/^E&O policy number/)).toHaveValue("EO-88231-PNCL");

    // Uploads are drop zones: a file input is the target, no separate button.
    expect(screen.getByLabelText(/driver/i)).toHaveAttribute("type", "file");

    expect(screen.getByText("2 on file")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove MN license")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove WI license")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add license" })).toBeDisabled();
  });

  it("shows the loading state instead of the form", () => {
    render(
      <PortalLicensingSection
        user={user}
        profile={null}
        loading={true}
        names={{ firstName: "", lastName: "" }}
      />,
    );

    expect(screen.getByText("Loading licensing details...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "State licenses" })).not.toBeInTheDocument();
  });
});

describe("portal profile documents section", () => {
  it("renders uploads as rows with 44px view and delete targets", async () => {
    documentRows = documents;
    render(<PortalProfileDocumentsSection user={user} />);

    expect(await screen.findByText("AHIP certification 2026")).toBeInTheDocument();
    expect(screen.getByText("1 uploaded")).toBeInTheDocument();
    expect(screen.getByText(/412 KB/)).toBeInTheDocument();
    expect(screen.getByLabelText("View AHIP certification 2026")).toHaveClass(
      "portal-profile-iconbtn",
    );
    expect(screen.getByLabelText("Delete AHIP certification 2026")).toBeInTheDocument();
  });

  it("falls back to the empty state with no uploads", async () => {
    documentRows = [];
    render(<PortalProfileDocumentsSection user={null} />);

    expect(await screen.findByText("Nothing uploaded yet")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Document name/)).toBeInTheDocument();
  });
});
