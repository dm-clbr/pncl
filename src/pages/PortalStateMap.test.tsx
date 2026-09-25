import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import PortalStateMap from "@/pages/PortalStateMap";
import { US_STATES } from "@/lib/us-states";

const availability = US_STATES.map((state) => ({
  stateCode: state.code,
  stateName: state.name,
  status: state.code === "DC" ? "Active" as const : state.code === "CA" ? "Pending" as const : "Inactive" as const,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T15:30:00.000Z",
}));
const reload = vi.fn();
let availabilityError: string | null = null;
let availabilityStates = availability;
let availabilityLoading = false;
let licenses: Record<string, string> = { DC: "LIC-DC" };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "agent-1", email: "agent@thepncl.com", user_metadata: { full_name: "Test Agent" } },
  }),
}));

vi.mock("@/hooks/usePortalProfile", () => ({
  usePortalProfile: () => ({
    profile: { address_state: "DC", state_license_numbers: licenses },
    photoUrl: null,
    initials: "TA",
    displayName: "Test Agent",
    loading: false,
  }),
}));

vi.mock("@/hooks/useStateAvailability", () => ({
  useStateAvailability: () => ({
    states: availabilityStates,
    loading: availabilityLoading,
    error: availabilityError,
    reload,
  }),
}));

// The SVG map is lazy and draws 9,348 points; the page suite reads what the
// page hands it instead.
vi.mock("@/components/portal/StateMapSvg", () => ({
  default: ({
    unavailable,
    licensed,
    filter,
    selected,
    loading,
    label,
  }: {
    unavailable: boolean;
    licensed: Set<string>;
    filter: string | null;
    selected: string | null;
    loading: boolean;
    label: string;
  }) => (
    <div
      data-testid="state-map"
      role="img"
      aria-label={label}
      data-unavailable={unavailable ? "true" : "false"}
      data-licensed={[...licensed].sort().join(",")}
      data-filter={filter ?? "none"}
      data-selected={selected ?? "none"}
      data-loading={loading ? "true" : "false"}
    />
  ),
}));

vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

// jsdom 20 ships HTMLDialogElement without showModal, close or the open
// reflection; the legend is a Sheet.
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

/** Forces the (max-width: 620px) branch: the finder moves into the sheet. */
const matchPhone = () => vi.spyOn(window, "matchMedia").mockImplementation(
  (query: string) => ({
    matches: query === "(max-width: 620px)",
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList,
);

let location = "";
function LocationProbe() {
  const current = useLocation();
  location = current.pathname + current.search;
  return null;
}

const renderPage = (entry = "/portal/state-map") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <PortalStateMap />
      <LocationProbe />
    </MemoryRouter>,
  );

const rows = (container: HTMLElement) => container.querySelectorAll(".smap-list > li");
const card = () => document.querySelector("article.smap-detail");

describe("portal state map", () => {
  beforeEach(() => {
    availabilityError = null;
    availabilityStates = availability;
    availabilityLoading = false;
    licenses = { DC: "LIC-DC" };
    reload.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders the map, the nav and a complete accessible state list", async () => {
    const { container } = renderPage();

    expect(await screen.findByTestId("state-map")).toHaveAccessibleName(
      "PNCL availability map: 1 active, 1 pending, 49 inactive. Use the state list to pick a state.",
    );
    expect(screen.getByRole("heading", { name: "State map", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Agent portal" })).toBeInTheDocument();
    expect(rows(container)).toHaveLength(51);
    // The digits roll in their own spans; the text read out is the total.
    expect(container.querySelector(".smap-count")).toHaveTextContent(/^51 results$/);
    // Each row says its status and the licence in words, so neither is left
    // to colour on the map.
    expect(screen.getByRole("button", { name: "District of Columbia Active Licensed" }))
      .toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "California Pending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Texas Inactive" })).toBeInTheDocument();
  });

  it("preselects the agent's own state and shows its card on a desktop", async () => {
    renderPage();
    await screen.findByTestId("state-map");
    expect(screen.getByTestId("state-map")).toHaveAttribute("data-selected", "DC");
    const detail = card() as HTMLElement;
    expect(within(detail).getByRole("heading", { name: "District of Columbia" })).toBeInTheDocument();
    expect(detail).toHaveTextContent("PNCL is currently operating in this state.");
    expect(detail).toHaveTextContent("Licensed on your profile");
    expect(detail).toHaveTextContent("LIC-DC");
    expect(detail).toHaveTextContent(/Updated\s*Aug 19, 2026/);
    // A preselection is not a pick: the URL stays clean.
    expect(location).toBe("/portal/state-map");
  });

  it("narrows the list and the map together, and keeps the filter in the URL", async () => {
    const { container } = renderPage();
    await screen.findByTestId("state-map");
    expect(screen.getByTestId("state-map")).toHaveAttribute("data-filter", "none");

    fireEvent.click(screen.getByRole("radio", { name: "Pending 1" }));
    expect(screen.getByRole("radio", { name: "Pending 1" })).toHaveAttribute("aria-checked", "true");
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByTestId("state-map")).toHaveAttribute("data-filter", "Pending");
    expect(location).toBe("/portal/state-map?filter=Pending");
    expect(container.querySelector(".smap-count")).toHaveTextContent(/^1 result$/);

    fireEvent.click(screen.getByRole("radio", { name: "All 51" }));
    expect(rows(container)).toHaveLength(51);
    expect(screen.getByTestId("state-map")).toHaveAttribute("data-filter", "none");
    expect(location).toBe("/portal/state-map");
  });

  it("searches by name or code down to one row, then to nothing", async () => {
    const { container } = renderPage();
    await screen.findByTestId("state-map");
    const search = screen.getByRole("searchbox", { name: "Search states" });
    expect(search).toHaveAttribute("placeholder", "Search or tap a state");
    expect(search).toHaveAttribute("enterkeyhint", "search");

    fireEvent.change(search, { target: { value: "cali" } });
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "California Pending" })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "tx" } });
    expect(rows(container)).toHaveLength(1);

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(rows(container)).toHaveLength(0);
    expect(screen.getByText("No states match")).toBeInTheDocument();
    expect(screen.getByText("Clear the search or the status filter.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(rows(container)).toHaveLength(51);
  });

  it("picks the first match on Enter and mirrors it as ?state=", async () => {
    renderPage();
    await screen.findByTestId("state-map");
    const search = screen.getByRole("searchbox", { name: "Search states" });
    fireEvent.change(search, { target: { value: "tex" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(within(card() as HTMLElement).getByRole("heading", { name: "Texas" })).toBeInTheDocument();
    expect(location).toBe("/portal/state-map?state=TX");
    expect(screen.getByTestId("state-map")).toHaveAttribute("data-selected", "TX");

    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
  });

  it("keeps a neutral map and a usable list when live data fails", async () => {
    availabilityError = "Unable to load state availability.";
    availabilityStates = [];
    renderPage();

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Live state availability is temporarily unavailable.");
    expect(notice).toHaveTextContent("No company status should be inferred from these colors.");
    expect(await screen.findByTestId("state-map")).toHaveAttribute("data-unavailable", "true");
    expect(screen.getByTestId("state-map")).toHaveAttribute("data-licensed", "DC");
    expect(screen.getAllByRole("button", { name: /Unavailable/ }).length).toBeGreaterThanOrEqual(51);
    expect(screen.getByRole("button", { name: "District of Columbia Unavailable Licensed" })).toBeInTheDocument();
    expect(within(card() as HTMLElement).getByText("Availability unavailable")).toBeInTheDocument();
    // Status filters mean nothing over placeholder data; Licensed still does.
    expect(screen.queryByRole("radio", { name: /Pending/ })).toBeNull();
    expect(screen.getByRole("radio", { name: "Licensed 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("shows the outline and three placeholder rows while loading", async () => {
    availabilityLoading = true;
    availabilityStates = [];
    renderPage();
    expect(await screen.findByTestId("state-map")).toHaveAttribute("data-loading", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading state availability…");
    expect(document.querySelectorAll(".smap-skeleton .portal-skeleton")).toHaveLength(3);
    expect(screen.queryByRole("group", { name: "Small states" })).toBeNull();
  });

  it("offers the licensing tab when the Licensed filter finds no licenses", async () => {
    licenses = {};
    renderPage("/portal/state-map?filter=Licensed");
    await screen.findByTestId("state-map");
    expect(screen.getByText("No state licenses are currently recorded on your profile.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add licenses" })).toHaveAttribute(
      "href",
      "/portal/profile?tab=licensing",
    );
  });

  it("gives the nine small states a named rail button that selects like a map tap", async () => {
    renderPage();
    await screen.findByTestId("state-map");
    const rail = screen.getByRole("group", { name: "Small states" });
    expect(within(rail).getAllByRole("button")).toHaveLength(9);
    fireEvent.click(within(rail).getByRole("button", { name: "Rhode Island, Inactive" }));
    expect(location).toBe("/portal/state-map?state=RI");
    expect(within(card() as HTMLElement).getByRole("heading", { name: "Rhode Island" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "District of Columbia, Active, Licensed" }))
      .not.toHaveAttribute("aria-current");
  });

  it("explains the map in the legend sheet behind the info button", async () => {
    renderPage();
    await screen.findByTestId("state-map");
    fireEvent.click(screen.getByRole("button", { name: "About this map" }));
    const legend = screen.getByRole("dialog", { name: "About this map" });
    expect(legend).toHaveAttribute("open");
    expect(legend).toHaveTextContent("Explore PNCL’s current operating availability.");
    expect(legend).toHaveTextContent("PNCL availability in this state is in progress.");
    expect(legend).toHaveTextContent("A license number is on file in your profile for this state.");
  });

  describe("on a phone", () => {
    it("opens no card on load and keeps the sheet at peek", async () => {
      matchPhone();
      renderPage();
      await screen.findByTestId("state-map");
      const sheet = screen.getByRole("region", { name: "Find a state" });
      expect(sheet.tagName).toBe("SECTION");
      expect(card()).toBeNull();
      // The preselection only outlines the agent's state.
      expect(screen.getByTestId("state-map")).toHaveAttribute("data-selected", "DC");
      expect(within(sheet).getByRole("searchbox", { name: "Search states" })).toBeInTheDocument();
      expect(within(sheet).getByRole("button", { name: "Show all states" })).toHaveAttribute("aria-expanded", "false");
      // One finder: nothing renders a second copy outside the sheet.
      expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    });

    it("opens the card on a pick and closes it back to peek", async () => {
      matchPhone();
      renderPage();
      await screen.findByTestId("state-map");

      fireEvent.click(screen.getByRole("button", { name: "Texas Inactive" }));
      const detail = card() as HTMLElement;
      expect(within(detail).getByRole("heading", { name: "Texas" })).toBeInTheDocument();
      expect(detail).toHaveTextContent("PNCL is not currently operating in this state.");
      expect(detail).toHaveTextContent("No license recorded on your profile.");
      expect(within(detail).getByRole("link", { name: "Add a license" })).toHaveAttribute(
        "href",
        "/portal/profile?tab=licensing",
      );
      // The card replaces search and filters.
      expect(screen.queryByRole("searchbox")).toBeNull();

      fireEvent.click(within(detail).getByRole("button", { name: "Close" }));
      expect(card()).toBeNull();
      expect(screen.getByRole("searchbox", { name: "Search states" })).toBeInTheDocument();
      expect(screen.getByTestId("state-map")).toHaveAttribute("data-selected", "none");
      expect(location).toBe("/portal/state-map");
    });

    it("opens the card for a ?state= deep link on load", async () => {
      matchPhone();
      renderPage("/portal/state-map?state=tx");
      await screen.findByTestId("state-map");
      expect(within(card() as HTMLElement).getByRole("heading", { name: "Texas" })).toBeInTheDocument();
      expect(screen.getByTestId("state-map")).toHaveAttribute("data-selected", "TX");
    });

    it("cycles the sheet from the grabber button without a drag", async () => {
      matchPhone();
      renderPage();
      await screen.findByTestId("state-map");
      fireEvent.click(screen.getByRole("button", { name: "Show all states" }));
      expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(screen.getByRole("button", { name: "Show less" }));
      expect(screen.getByRole("button", { name: "Show all states" })).toHaveAttribute("aria-expanded", "false");
    });

    it("moves focus to the card on a keyboard pick and back to the row on close", async () => {
      matchPhone();
      renderPage();
      await screen.findByTestId("state-map");

      const texas = screen.getByRole("button", { name: "Texas Inactive" });
      fireEvent.keyDown(texas, { key: "Enter" });
      fireEvent.click(texas);
      await act(async () => {});
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Texas" }));

      fireEvent.click(within(card() as HTMLElement).getByRole("button", { name: "Close" }));
      await act(async () => {});
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Texas Inactive" }));
    });
  });
});
