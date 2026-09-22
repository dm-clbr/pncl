import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalCarrierSheet from "@/pages/PortalCarrierSheet";
import type { PortalCarrier } from "@/lib/portal-carriers";

const carrierState = vi.hoisted(() => ({
  carriers: [] as PortalCarrier[],
  loading: false,
  error: null as string | null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "agent-1", email: "agent@thepncl.com" } }),
}));
vi.mock("@/hooks/usePortalProfile", () => ({
  usePortalProfile: () => ({
    profile: null,
    photoUrl: null,
    initials: "PG",
    displayName: "Porter Gerlach",
    loading: false,
  }),
}));
vi.mock("@/hooks/usePortalCarriers", () => ({ usePortalCarriers: () => carrierState }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

const CARRIERS: PortalCarrier[] = [
  {
    id: "1",
    carrier: "Mutual of Omaha",
    companyNumber: "MOO-4412",
    eAppLabel: "Quote and apply",
    eAppUrl: "https://example.com/moo",
    section: "SureLC: Life",
  },
  {
    id: "2",
    carrier: "Athene",
    companyNumber: "ATH-1190",
    eAppLabel: "",
    eAppUrl: null,
    section: "Automatic",
  },
  { id: "3", carrier: "", companyNumber: "", eAppLabel: "", eAppUrl: null, section: "Automatic" },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <PortalCarrierSheet />
    </MemoryRouter>,
  );

describe("PortalCarrierSheet", () => {
  beforeEach(() => {
    carrierState.carriers = [];
    carrierState.loading = false;
    carrierState.error = null;
  });

  it("keeps the loading state", () => {
    carrierState.loading = true;
    renderPage();
    expect(screen.getByLabelText("Loading carriers")).toBeInTheDocument();
  });

  it("keeps the error state", () => {
    carrierState.error = "Unable to load carriers";
    renderPage();
    expect(screen.getByText("Unable to load carriers")).toBeInTheDocument();
  });

  it("keeps the empty state", () => {
    renderPage();
    expect(screen.getByText("No carriers yet")).toBeInTheDocument();
  });

  it("groups carriers under their section heading and links the e-app out", () => {
    carrierState.carriers = CARRIERS;
    renderPage();

    expect(screen.getByRole("heading", { name: "SureLC: Life" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Automatic" })).toBeInTheDocument();

    const eApp = screen.getByRole("link", { name: /Mutual of Omaha/ });
    expect(eApp).toHaveAttribute("href", "https://example.com/moo");
    expect(eApp).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Company MOO-4412 · Quote and apply")).toBeInTheDocument();

    // A carrier with no e-app is a plain row, and the sheet's blank spacer
    // rows are dropped rather than rendered as empty 44px rows.
    expect(screen.queryByRole("link", { name: /Athene/ })).not.toBeInTheDocument();
    expect(screen.getByText("Athene")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
