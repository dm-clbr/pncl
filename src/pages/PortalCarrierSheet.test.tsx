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
  {
    id: "4",
    carrier: "",
    companyNumber: "",
    eAppLabel: "",
    eAppUrl: "https://example.com/link-only",
    section: "Automatic",
  },
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

    // A row carrying only a hyperlink keeps its link, labelled by the URL.
    const urlOnly = screen.getByRole("link", { name: /link-only/ });
    expect(urlOnly).toHaveAttribute("href", "https://example.com/link-only");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  // The five headers the brief names come from portal_carriers.section, set by
  // supabase/migrations/20260724000000_carrier_sheet_sections.sql (three SureLC
  // strings plus "Automatic"; "Other" is the page's fallback for a published
  // row whose section is blank). The Edge Function orders by sort_order, which
  // that migration assigns 0..13 in section order, so each section is one run.
  it("renders the five headers the live section values produce, in sheet order", () => {
    const section1 = 'SureLC #1 — "Basso Montemurro"';
    const section2 = 'SureLC #2 — "The Pinnacle Life Group"';
    const section3 = 'SureLC #3 — "Pinnacle Life Group"';
    const row = (id: string, carrier: string, section: string): PortalCarrier => ({
      id,
      carrier,
      companyNumber: "",
      eAppLabel: "",
      eAppUrl: null,
      section,
    });
    carrierState.carriers = [
      row("1", "American Amicable", section1),
      row("2", "Fidelity & Guaranty", section2),
      row("3", "AuguStar", section3),
      row("4", "Ethos", "Automatic"),
      row("5", "Legacy carrier", ""),
    ];
    renderPage();

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((node) => node.textContent);
    expect(headings).toEqual([section1, section2, section3, "Automatic", "Other"]);
  });

  // Dropping a blank row can only join two runs that already carry the same
  // section string, which is one section by definition. A blank row cannot keep
  // two differently named sections apart, so filtering first loses nothing.
  it("joins two runs of one section that a blank row had split", () => {
    const blank: PortalCarrier = {
      id: "b",
      carrier: "",
      companyNumber: "",
      eAppLabel: "",
      eAppUrl: null,
      section: "Automatic",
    };
    carrierState.carriers = [
      { ...blank, id: "1", carrier: "Ethos" },
      blank,
      { ...blank, id: "2", carrier: "United Home Life" },
    ];
    renderPage();

    expect(screen.getAllByRole("heading", { name: "Automatic" })).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
