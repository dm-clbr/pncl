import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import PortalNewLookAnnouncement from "@/components/portal/PortalNewLookAnnouncement";

const title = "Meet your refreshed portal";
const key = "pncl.portal-announcement.new-look-2026-10.agent-1";
const proto = HTMLDialogElement.prototype;
const originalShow = Object.getOwnPropertyDescriptor(proto, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(proto, "close");

beforeAll(() => {
  Object.defineProperty(proto, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(proto, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterAll(() => {
  for (const [name, descriptor] of [["showModal", originalShow], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(proto, name, descriptor);
    else Reflect.deleteProperty(proto, name);
  }
});
beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("new-look announcement", () => {
  it("opens and focuses its title, then stays dismissed after remounting", () => {
    const view = render(<PortalNewLookAnnouncement userId="agent-1" />);
    expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: title })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Explore the portal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(key)).toBe("1");
    view.unmount();
    render(<PortalNewLookAnnouncement userId="agent-1" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps dismissals separate for different accounts", () => {
    const view = render(<PortalNewLookAnnouncement userId="agent-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    view.rerender(<PortalNewLookAnnouncement userId="agent-2" />);
    expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
  });

  it("still dismisses when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
    const view = render(<PortalNewLookAnnouncement userId="agent-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Explore the portal" }));
    view.rerender(<PortalNewLookAnnouncement userId="agent-1" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the announcement is dismissed in another browser tab", () => {
    render(<PortalNewLookAnnouncement userId="agent-1" />);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key, newValue: "1" })));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not show without an authenticated account", () => {
    render(<PortalNewLookAnnouncement />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can preview a dismissed announcement without changing its saved state", () => {
    window.localStorage.setItem(key, "1");
    const save = vi.spyOn(Storage.prototype, "setItem");
    render(<PortalNewLookAnnouncement userId="agent-1" preview />);
    expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Explore the portal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(key)).toBe("1");
  });
});
