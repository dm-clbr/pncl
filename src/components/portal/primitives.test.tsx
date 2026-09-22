import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import BottomNav from "@/components/portal/BottomNav";
import Chip from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import Segmented, { nextIndex } from "@/components/portal/Segmented";
import Sheet from "@/components/portal/Sheet";
import Skeleton from "@/components/portal/Skeleton";
import Stepper from "@/components/portal/Stepper";

const STAGES = ["On-Board", "Pre-License", "Licensing", "New Producer", "Sales Ready"];

// jsdom 20 ships HTMLDialogElement without showModal, close or the open
// reflection. The stand-in mirrors the native contract the Sheet relies on:
// showModal opens, close flips open off and fires a close event.
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
  // jsdom has no pointer capture; the drag only needs the call not to throw.
  Element.prototype.setPointerCapture = () => {};
});

describe("Sheet", () => {
  it("opens with focus on the title and reports every close through onClose", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open onClose={onClose} title="Onboarding checklist">
        <p>Body</p>
      </Sheet>,
    );

    const dialog = screen.getByRole("dialog", { name: "Onboarding checklist" });
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Onboarding checklist" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog).not.toHaveAttribute("open");

    // Owner flips the prop; the effect must not close an already closed dialog.
    rerender(
      <Sheet open={false} onClose={onClose} title="Onboarding checklist">
        <p>Body</p>
      </Sheet>,
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    // Backdrop and bare surface both report the dialog element as the target;
    // only a point outside the dialog's box may close it. jsdom lays out
    // nothing, so the open sheet is given a box: a 390px-wide bottom sheet
    // from y 400 to 844.
    rerender(
      <Sheet open onClose={onClose} title="Onboarding checklist">
        <p>Body</p>
      </Sheet>,
    );
    expect(dialog).toHaveAttribute("open");
    dialog.getBoundingClientRect = () =>
      ({ left: 0, top: 400, right: 390, bottom: 844, x: 0, y: 400, width: 390, height: 444 }) as DOMRect;
    fireEvent.click(screen.getByText("Body"), { clientX: 195, clientY: 600 });
    expect(onClose).toHaveBeenCalledTimes(1);
    // Top edge of the dialog: the 8px strip above the drag handle.
    fireEvent.click(dialog, { clientX: 195, clientY: 400 });
    expect(onClose).toHaveBeenCalledTimes(1);
    // Beside the 36px pill, inside the handle strip.
    fireEvent.click(dialog, { clientX: 40, clientY: 406 });
    expect(onClose).toHaveBeenCalledTimes(1);
    // Backdrop above the sheet.
    fireEvent.click(dialog, { clientX: 195, clientY: 399 });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("dismisses on a swipe down over the handle and ignores a short drag", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Sheet open onClose={onClose} title="Alabama" size="half">
        <p>Body</p>
      </Sheet>,
    );

    const dialog = screen.getByRole("dialog", { name: "Alabama" });
    const handle = container.querySelector(".portal-sheet-handle") as HTMLElement;
    expect(dialog.className).toContain("is-half");

    // jsdom's PointerEvent drops clientY, so the pointer events are dispatched
    // as MouseEvents of the same type; React dispatches on the type.
    const drag = (type: string, clientY: number) =>
      fireEvent(handle, new MouseEvent(type, { bubbles: true, clientY }));

    // A 40px nudge is under the 56px threshold: the sheet stays open.
    drag("pointerdown", 500);
    drag("pointermove", 540);
    drag("pointerup", 540);
    expect(dialog).toHaveAttribute("open");
    expect(onClose).not.toHaveBeenCalled();

    // Past the threshold, and the transform used while dragging is cleared.
    drag("pointerdown", 500);
    drag("pointermove", 620);
    expect(dialog.style.transform).toBe("translateY(120px)");
    drag("pointerup", 620);
    expect(dialog.style.transform).toBe("");
    expect(dialog).not.toHaveAttribute("open");
    expect(onClose).toHaveBeenCalledTimes(1);

    // A pointerup with no drag behind it never closes it.
    drag("pointerup", 300);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Stepper", () => {
  it("marks steps before the current as done and the current with aria-current", () => {
    render(<Stepper steps={STAGES} current={3} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items.map((li) => li.className)).toEqual([
      "portal-step is-done",
      "portal-step is-done",
      "portal-step is-current",
      "portal-step is-todo",
      "portal-step is-todo",
    ]);
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items[1]).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders buttons that report the 1-based step when onSelect is given", () => {
    const onSelect = vi.fn();
    render(<Stepper steps={STAGES} current={1} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Licensing" }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });
});

describe("Pane", () => {
  it("renders the header only when it has one and names the section by its title", () => {
    const { rerender } = render(
      <Pane title="Documents" aside="04">
        <p>Body</p>
      </Pane>,
    );

    const pane = screen.getByRole("region", { name: "Documents" });
    expect(pane.tagName).toBe("SECTION");
    expect(within(pane).getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    expect(within(pane).getByText("04")).toBeInTheDocument();

    rerender(
      <Pane as="div">
        <p>Body</p>
      </Pane>,
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Body").parentElement).toHaveClass("portal-pane");
  });
});

describe("ListRow", () => {
  const router = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

  it("picks its element and its default trailing glyph from the href", () => {
    // Internal: a router link, a chevron, no new-tab promise.
    const { unmount } = router(<ListRow label="My Clients" href="/portal/clients" />);
    const internal = screen.getByRole("link", { name: "My Clients" });
    expect(internal).toHaveAttribute("href", "/portal/clients");
    expect(internal).not.toHaveAttribute("target");
    expect(internal.querySelector(".lucide-chevron-right")).toBeInTheDocument();
    unmount();

    // Offsite: a new tab, the outbound glyph and the promise said out loud.
    router(<ListRow label="LeadSpply" href="https://leadspply.test/register" />);
    const external = screen.getByRole("link", { name: /LeadSpply/ });
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noreferrer");
    expect(external).toHaveTextContent("opens in a new tab");
    expect(external.querySelector(".lucide-arrow-up-right")).toBeInTheDocument();
  });

  it("downloads in the same tab and keeps an explicit trailing slot", () => {
    router(
      <ListRow
        label="Dialing 123"
        href="https://files.test/a.pdf"
        download="a.pdf"
        trailing={<Chip variant="pdf">PDF</Chip>}
      />,
    );

    const row = screen.getByRole("link", { name: /Dialing 123/ });
    expect(row).toHaveAttribute("download", "a.pdf");
    expect(row).not.toHaveAttribute("target");
    expect(row).not.toHaveTextContent("opens in a new tab");
    expect(row.querySelector(".portal-chip")).toHaveTextContent("PDF");
  });

  it("falls back to a button, then to a div, and honours trailing={null}", () => {
    const onClick = vi.fn();
    const { unmount } = router(<ListRow label="Mark complete" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();

    router(<ListRow label="Static" secondary="No target" href="/portal" trailing={null} />);
    const row = screen.getByRole("link", { name: /Static/ });
    expect(row.querySelector(".portal-row-trail")).toBeNull();
    expect(row).toHaveTextContent("No target");
  });
});

describe("Chip", () => {
  it("defaults to neutral and carries its variant class", () => {
    render(
      <>
        <Chip>14 states</Chip>
        <Chip variant="pending">Pending</Chip>
      </>,
    );
    expect(screen.getByText("14 states")).toHaveClass("portal-chip", "is-neutral");
    expect(screen.getByText("Pending")).toHaveClass("portal-chip", "is-pending");
  });
});

describe("EmptyState", () => {
  it("drops the body and the action when it has neither", () => {
    const { container, rerender } = render(<EmptyState title="Nothing matches that search" />);
    expect(screen.getByText("Nothing matches that search")).toBeInTheDocument();
    expect(container.querySelector(".portal-empty-body")).toBeNull();
    expect(container.querySelector(".portal-empty-action")).toBeNull();

    rerender(
      <EmptyState
        title="No documents yet"
        body="Signed agreements land here."
        action={<button type="button">Open the checklist</button>}
      />,
    );
    expect(container.querySelector(".portal-empty-body")).toHaveTextContent("Signed agreements land here.");
    expect(screen.getByRole("button", { name: "Open the checklist" })).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech and takes the width it is given", () => {
    const { container } = render(<Skeleton variant="row" width="38%" />);
    const block = container.firstElementChild as HTMLElement;
    expect(block).toHaveClass("portal-skeleton", "is-row");
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block.style.width).toBe("38%");
  });
});

describe("Field", () => {
  it("wires the label, the hint and the error to the input it renders", () => {
    render(
      <Field
        label="Mobile number"
        id="phone"
        hint="We text the activation link here."
        error="Enter a 10 digit number."
        required
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="801 555 0134"
      />,
    );

    const input = screen.getByLabelText(/Mobile number/);
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveClass("portal-input");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("type", "tel");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "tel");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "phone-hint phone-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a 10 digit number.");
  });

  it("describes nothing and claims nothing invalid without a hint or an error", () => {
    render(<Field label="First name" id="first" autoComplete="given-name" />);

    const input = screen.getByLabelText("First name");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hands the same wiring to a child control instead of rendering an input", () => {
    const { container } = render(
      <Field label="State" id="state" error="Pick a state.">
        <select className="portal-select" defaultValue="">
          <option value="">Choose</option>
          <option value="UT">Utah</option>
        </select>
      </Field>,
    );

    const select = screen.getByLabelText("State");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveClass("portal-select");
    expect(select).toHaveAttribute("aria-describedby", "state-error");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(container.querySelector("input")).toBeNull();
  });

  it("keeps its own id on a child that brought one and forwards the rest of the props", () => {
    const onChange = vi.fn();
    render(
      <Field label="Resident state" id="state" onChange={onChange}>
        <select className="portal-select" id="brought-its-own" defaultValue="">
          <option value="">Choose</option>
          <option value="UT">Utah</option>
        </select>
      </Field>,
    );

    // The label's htmlFor is the Field id, so losing it costs the accessible name.
    const select = screen.getByLabelText("Resident state");
    expect(select).toHaveAttribute("id", "state");
    fireEvent.change(select, { target: { value: "UT" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("Segmented", () => {
  const TABS = [
    { value: "details", label: "Details" },
    { value: "team", label: "Team" },
    { value: "licensing", label: "Licensing" },
  ];

  it("wraps the roving index at both ends and ignores keys that are not its own", () => {
    expect(nextIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextIndex("ArrowLeft", 2, 3)).toBe(1);
    expect(nextIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextIndex("Home", 2, 3)).toBe(0);
    expect(nextIndex("End", 0, 3)).toBe(2);
    expect(nextIndex("Enter", 1, 3)).toBeNull();
    expect(nextIndex(" ", 1, 3)).toBeNull();
  });

  it("is a roving tablist: one tab in the tab order, arrows move focus and value", () => {
    const onChange = vi.fn();
    render(<Segmented items={TABS} value="team" onChange={onChange} label="Profile sections" />);

    expect(screen.getByRole("tablist", { name: "Profile sections" })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");

    fireEvent.click(tabs[2]);
    expect(onChange).toHaveBeenLastCalledWith("licensing");

    fireEvent.keyDown(tabs[1], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("licensing");
    expect(tabs[2]).toHaveFocus();

    fireEvent.keyDown(tabs[1], { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("details");
    expect(tabs[0]).toHaveFocus();

    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("licensing");
    expect(tabs[2]).toHaveFocus();

    onChange.mockClear();
    fireEvent.keyDown(tabs[1], { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps index 0 in the tab order when the value matches no item", () => {
    // A stale ?tab= in a bookmarked URL: without a fallback every tab is -1 and
    // the group leaves the tab order with no keyboard way back in.
    render(<Segmented items={TABS} value="archived" onChange={() => {}} label="Profile sections" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "false",
      "false",
    ]);
  });

  it("becomes router links with aria-current when linkTo is given", () => {
    render(
      <MemoryRouter>
        <Segmented
          items={TABS}
          value="team"
          label="Profile sections"
          linkTo={(value) => `/portal/profile?tab=${value}`}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Profile sections" })).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links[1]).toHaveAttribute("href", "/portal/profile?tab=team");
    expect(links[1]).toHaveAttribute("aria-current", "page");
    expect(links[0]).not.toHaveAttribute("aria-current");
  });

  it("fades only the edges that have content behind them", () => {
    render(<Segmented items={TABS} value="team" onChange={() => {}} label="Profile sections" />);
    const track = screen.getByRole("tablist");

    // jsdom has no layout, so every scroll metric reads 0: the test supplies them.
    const scrollTo = (scrollWidth: number, clientWidth: number, scrollLeft: number) => {
      Object.defineProperty(track, "scrollWidth", { value: scrollWidth, configurable: true });
      Object.defineProperty(track, "clientWidth", { value: clientWidth, configurable: true });
      Object.defineProperty(track, "scrollLeft", { value: scrollLeft, configurable: true });
      fireEvent.scroll(track);
    };

    scrollTo(300, 300, 0);
    expect(track.dataset.fadeStart).toBe("false");
    expect(track.dataset.fadeEnd).toBe("false");

    scrollTo(600, 300, 0);
    expect(track.dataset.fadeStart).toBe("false");
    expect(track.dataset.fadeEnd).toBe("true");

    scrollTo(600, 300, 300);
    expect(track.dataset.fadeStart).toBe("true");
    expect(track.dataset.fadeEnd).toBe("false");
  });
});

describe("PortalHeader", () => {
  it("shows the photo when there is one and the initials when there is not", () => {
    const { rerender } = render(
      <MemoryRouter>
        <PortalHeader name="Porter Gerlach" email="porter@thepncl.com" initials="PG" stage="Licensing" />
      </MemoryRouter>,
    );

    // The avatar is decorative, so the initials are the only proof it fell back.
    expect(screen.getByText("PG")).toBeInTheDocument();
    expect(document.querySelector(".portal-header-avatar img")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Employee Portal" })).toBeInTheDocument();
    expect(screen.getByText("Licensing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View profile" })).toHaveAttribute(
      "href",
      "/portal/profile",
    );

    rerender(
      <MemoryRouter>
        <PortalHeader name="Porter Gerlach" initials="PG" photoUrl="/photo.jpg" />
      </MemoryRouter>,
    );
    expect(document.querySelector(".portal-header-avatar img")).toHaveAttribute(
      "src",
      "/photo.jpg",
    );
    expect(screen.queryByText("PG")).not.toBeInTheDocument();
    // No stage and no email means no empty badge and no empty line.
    expect(document.querySelector(".portal-header-stage")).toBeNull();
    expect(document.querySelector(".portal-header-mail")).toBeNull();
  });
});

describe("BottomNav", () => {
  it("marks only the current tab and never carries a sign out", () => {
    render(
      <MemoryRouter initialEntries={["/portal/calendar"]}>
        <BottomNav />
      </MemoryRouter>,
    );

    const links = within(screen.getByRole("navigation", { name: "Portal sections" })).getAllByRole(
      "link",
    );
    expect(links.map((link) => link.textContent)).toEqual([
      "Dashboard",
      "Calendar",
      "State Map",
      "Profile",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/portal",
      "/portal/calendar",
      "/portal/state-map",
      "/portal/profile",
    ]);
    expect(links[1]).toHaveAttribute("aria-current", "page");
    expect(links[1].className).toContain("active");
    expect(links.filter((link) => link.hasAttribute("aria-current"))).toHaveLength(1);
    expect(screen.queryByText(/sign out/i)).not.toBeInTheDocument();
  });

  it("keeps Dashboard exact so a sub-route does not light it up", () => {
    render(
      <MemoryRouter initialEntries={["/portal/state-map"]}>
        <BottomNav />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    expect(links[0]).not.toHaveAttribute("aria-current");
    expect(links[2]).toHaveAttribute("aria-current", "page");
  });
});

describe("PortalSubpageHeader", () => {
  it("defaults the back link to the portal and takes an override", () => {
    const { rerender } = render(
      <MemoryRouter>
        <PortalSubpageHeader title="Pay & Commissions" />
      </MemoryRouter>,
    );

    const back = screen.getByRole("link", { name: "Back to portal" });
    expect(back).toHaveAttribute("href", "/portal");
    expect(screen.getByRole("heading", { level: 1, name: "Pay & Commissions" })).toBeInTheDocument();
    expect(document.querySelector(".portal-subhead-aside")).toBeNull();

    rerender(
      <MemoryRouter>
        <PortalSubpageHeader
          title="Carriers"
          backTo="/portal/resources"
          backLabel="Back to resources"
          aside={<Chip variant="active">Live</Chip>}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Back to resources" })).toHaveAttribute(
      "href",
      "/portal/resources",
    );
    // The label stays in the DOM at every width; only CSS hides it on a phone.
    expect(screen.getByText("Back to resources")).toBeInTheDocument();
    expect(within(document.querySelector(".portal-subhead-aside")!).getByText("Live")).toBeInTheDocument();
  });
});
