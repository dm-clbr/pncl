import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import Sheet from "@/components/portal/Sheet";
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

    // Backdrop: a click whose target is the dialog element itself.
    rerender(
      <Sheet open onClose={onClose} title="Onboarding checklist">
        <p>Body</p>
      </Sheet>,
    );
    expect(dialog).toHaveAttribute("open");
    fireEvent.click(screen.getByText("Body"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(dialog);
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
