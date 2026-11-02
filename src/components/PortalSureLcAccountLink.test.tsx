import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalSureLcAccountLink from "./PortalSureLcAccountLink";
import { DEFAULT_SURELC_ACCOUNT_LINKS } from "@/lib/surelc-accounts";
import carriers from "@/test/fixtures/published-carriers.json";
import type { PortalCarrier } from "@/lib/portal-carriers";

const state = vi.hoisted(() => ({
  carriers: [] as PortalCarrier[], loading: false, error: null as string | null, reload: vi.fn(),
}));
vi.mock("@/hooks/usePortalCarriers", () => ({ usePortalCarriers: () => state }));
beforeEach(() => {
  state.carriers = carriers;
  state.loading = false;
  state.error = null;
  state.reload.mockClear();
});

function open(number = 1) {
  render(<PortalSureLcAccountLink account={DEFAULT_SURELC_ACCOUNT_LINKS[number - 1]} />);
  fireEvent.click(screen.getByRole("button", { name: `Open SureLC #${number}` }));
  return within(screen.getByRole("alertdialog"));
}

describe("SureLC current carrier warning", () => {
  it.each([1, 2, 3])("shows only the current sheet carriers for account %s", (number) => {
    const dialog = open(number);
    expect(dialog.getAllByRole("listitem").map(li => li.textContent)).toEqual(
      carriers.filter(c => c.section.startsWith(`SureLC #${number} `)).map(c => c.carrier),
    );
    expect(dialog.getByText("CICA, Ethos and United Home Life links are sent to your PNCL email automatically. Do not request them in SureLC.")).toBeInTheDocument();
    expect(dialog.getByRole("link", { name: `Continue to SureLC #${number}` })).toHaveAttribute("href", DEFAULT_SURELC_ACCOUNT_LINKS[number - 1].href);
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent(/American Amicable|Liberty Bankers|Royal Neighbors|AuguStar/);
  });

  it("waits for the current list before allowing continuation", () => {
    state.loading = true;
    const dialog = open();
    expect(dialog.getByRole("status")).toHaveTextContent("Loading current carriers");
    expect(dialog.queryByRole("link")).toBeNull();
  });

  it("offers retry without falling back to obsolete carriers on a failed request", () => {
    state.error = "Network error";
    const dialog = open();
    expect(dialog.getByRole("alert")).toHaveTextContent("Unable to load");
    expect(dialog.queryByRole("link")).toBeNull();
    fireEvent.click(dialog.getByRole("button", { name: "Retry carrier list" }));
    expect(state.reload).toHaveBeenCalledOnce();
  });

  it("does not restore a removed account's carrier list", () => {
    state.carriers = carriers.filter(c => !c.section.startsWith("SureLC #1"));
    const dialog = open();
    expect(dialog.getByRole("status")).toHaveTextContent("No carriers are currently listed");
    expect(dialog.queryByRole("link")).toBeNull();
  });
});
