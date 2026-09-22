import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import Chip from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
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
});
