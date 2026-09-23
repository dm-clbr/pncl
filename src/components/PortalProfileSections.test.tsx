import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { CarrierCredentialsView } from "@/components/PortalCarrierCredentials";
import PortalLicensingSection from "@/components/PortalLicensingSection";
import PortalProfileDocumentsSection from "@/components/PortalProfileDocumentsSection";
import type { PortalProfile } from "@/lib/portal-profile";

// The page test mocks both of these components away, so the rebuilt markup is
// asserted here against the real components instead.
let driversLicenseUrl: string | null = null;

vi.mock("@/lib/portal-profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/portal-profile")>(
    "@/lib/portal-profile",
  );
  return {
    ...actual,
    getDriversLicenseUrl: () => Promise.resolve(driversLicenseUrl),
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

// jsdom 20 ships HTMLDialogElement without showModal, close or the open
// reflection, the same stand-in src/components/portal/primitives.test.tsx uses.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  if (!("open" in proto)) {
    Object.defineProperty(proto, "open", {
      configurable: true,
      get(this: HTMLDialogElement) {
        return this.hasAttribute("open");
      },
      set(this: HTMLDialogElement, value: boolean) {
        if (value) this.setAttribute("open", "");
        else this.removeAttribute("open");
      },
    });
  }
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

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

  it("gives a saved driver's license its own view link, not just the drop zone thumb", async () => {
    driversLicenseUrl = "https://files.thepncl.com/license.jpg";
    try {
      render(
        <PortalLicensingSection
          user={user}
          profile={{ ...licensingProfile, drivers_license_path: "agent-1/license.jpg" }}
          loading={false}
          names={{ firstName: "Porter", lastName: "Gerlach" }}
        />,
      );

      // The thumb sits under the file input, so without this link the only way
      // to look at the saved scan is to replace it.
      const view = await screen.findByRole("link", { name: "View image" });
      expect(view).toHaveAttribute("href", driversLicenseUrl);
      expect(view).toHaveAttribute("rel", "noopener noreferrer");
      expect(screen.getByText("Image on file")).toBeInTheDocument();
    } finally {
      driversLicenseUrl = null;
    }
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

describe("portal carrier credentials", () => {
  // Invented values: a real carrier login never reaches a test or a screenshot.
  const carriers = [
    {
      carrierId: "c1",
      carrier: "Americo",
      loginUrl: "https://agents.example-carrier.com",
      username: "p.gerlach",
      password: "sample-value",
      writingNumber: "AM-4471902",
      applicationSubmitted: true,
    },
    {
      carrierId: "c2",
      carrier: "Foresters Financial",
      loginUrl: null,
      username: null,
      password: null,
      writingNumber: null,
    },
  ];

  it("gives each carrier a row and keeps the table password masked until asked", () => {
    render(
      <CarrierCredentialsView
        credentials={carriers}
        loading={false}
        error={null}
        save={vi.fn()}
      />,
    );

    // The row carries the name and the writing number, never the credentials.
    expect(screen.getByRole("button", { name: /Americo/ })).toHaveTextContent(
      "Writing # AM-4471902",
    );
    expect(screen.getByRole("button", { name: /Foresters/ })).toHaveTextContent("Not added");

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("sample-value")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Show password"));
    expect(screen.getByText("sample-value")).toBeInTheDocument();
  });

  it("opens the sheet on the row with the fields masked and off autocomplete", () => {
    render(
      <CarrierCredentialsView
        credentials={carriers}
        loading={false}
        error={null}
        save={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Americo/ }));

    const sheet = screen.getByRole("dialog", { name: "Americo" });
    const password = within(sheet).getByLabelText(/^Password/);
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "off");
    expect(password).toHaveValue("sample-value");
    expect(within(sheet).getByLabelText(/^Username/)).toHaveValue("p.gerlach");
    expect(within(sheet).getByLabelText(/^Writing number/)).toHaveValue("AM-4471902");

    fireEvent.click(within(sheet).getByLabelText("Show password"));
    expect(password).toHaveAttribute("type", "text");
  });

  it("round-trips the prefilled sheet through save, then clears the password", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <CarrierCredentialsView
        credentials={carriers}
        loading={false}
        error={null}
        save={save}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Americo/ }));
    const sheet = screen.getByRole("dialog", { name: "Americo" });
    const form = sheet.querySelector("form") as HTMLFormElement;

    // Untouched submit resends the stored values, so the prefill round-trips.
    fireEvent.submit(form);
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        carrierId: "c1",
        username: "p.gerlach",
        password: "sample-value",
        writingNumber: "AM-4471902",
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Americo credentials saved."));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Americo" })).not.toBeInTheDocument(),
    );

    // A cleared password still means "keep the current one".
    fireEvent.click(screen.getByRole("button", { name: /Americo/ }));
    const reopened = screen.getByRole("dialog", { name: "Americo" });
    fireEvent.change(within(reopened).getByLabelText(/^Password/), { target: { value: "" } });
    fireEvent.submit(reopened.querySelector("form") as HTMLFormElement);
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({
        carrierId: "c1",
        username: "p.gerlach",
        password: undefined,
        writingNumber: "AM-4471902",
      }),
    );
  });

  it("keeps the loading, error and empty states", () => {
    const { rerender } = render(
      <CarrierCredentialsView credentials={[]} loading error={null} save={vi.fn()} />,
    );
    expect(screen.getByText("Loading carrier accounts...")).toBeInTheDocument();

    rerender(
      <CarrierCredentialsView
        credentials={[]}
        loading={false}
        error="Unable to load carrier credentials"
        save={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load carrier credentials");

    rerender(
      <CarrierCredentialsView credentials={[]} loading={false} error={null} save={vi.fn()} />,
    );
    expect(screen.getByText("No carriers yet")).toBeInTheDocument();
  });
});
