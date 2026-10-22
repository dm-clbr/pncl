import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HierarchyCanvas } from "@/components/admin/HierarchyCanvas";
import { HierarchyTree } from "@/components/admin/HierarchyTree";
import type { HierarchyNode } from "@/lib/admin-api";

const TREE: HierarchyNode[] = [{
  id: "partner:one:two",
  email: "",
  name: "One & Two",
  role: "agent",
  status: null,
  compLevel: null,
  compLevelEffectiveAt: null,
  profilePhotoPath: null,
  profileUpdatedAt: null,
  isPartnerGroup: true,
  memberIds: ["one", "two"],
  members: [
    { id: "one", email: "one@thepncl.com", name: "One", role: "agent", status: null, npn: null, compLevel: null, compLevelEffectiveAt: null, profilePhotoPath: null, profileUpdatedAt: null },
    { id: "two", email: "two@thepncl.com", name: "Two", role: "agent", status: null, npn: null, compLevel: null, compLevelEffectiveAt: null, profilePhotoPath: null, profileUpdatedAt: null },
  ],
  children: [{
    id: "child",
    email: "child@thepncl.com",
    name: "Child",
    role: "agent",
    status: null,
    compLevel: 80,
    compLevelEffectiveAt: null,
    profilePhotoPath: null,
    profileUpdatedAt: null,
    children: [],
  }],
}];

describe("hierarchy focus", () => {
  it("centers a partner node for a member and honors repeat focus requests", () => {
    const { container, rerender } = render(<HierarchyCanvas tree={TREE} selectedNodeId="partner:one:two" onSelectNode={() => undefined} />);
    const viewport = container.querySelector<HTMLElement>(".admin-hierarchy-viewport")!;
    Object.defineProperties(viewport, { clientWidth: { configurable: true, value: 800 }, clientHeight: { configurable: true, value: 600 } });

    rerender(<HierarchyCanvas tree={TREE} selectedNodeId="partner:one:two" focusRequest={{ userId: "two", requestId: 1 }} onSelectNode={() => undefined} />);
    expect(container.querySelector(".admin-hierarchy-transform")).toHaveStyle({ transform: "translate(286px, 174px) scale(1)" });
    expect(container.querySelector(".admin-hierarchy-tile-selected")).toBeInTheDocument();

    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 1000 });
    rerender(<HierarchyCanvas tree={TREE} selectedNodeId="partner:one:two" focusRequest={{ userId: "two", requestId: 2 }} onSelectNode={() => undefined} />);
    expect(container.querySelector(".admin-hierarchy-transform")).toHaveStyle({ transform: "translate(386px, 174px) scale(1)" });
  });

  it("expands collapsed ancestors and scrolls the target row in the tree viewport", () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if ((this as HTMLElement).classList.contains("admin-hierarchy-tree-wrap")) {
        return { top: 0, left: 0, right: 200, bottom: 500, width: 200, height: 500, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      }
      if ((this as HTMLElement).dataset.hierarchyNodeId === "child") {
        return { top: 400, left: 40, right: 300, bottom: 440, width: 260, height: 40, x: 40, y: 400, toJSON: () => ({}) } as DOMRect;
      }
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    const { container, rerender } = render(<HierarchyTree tree={TREE} selectedNodeId="partner:one:two" onSelectNode={() => undefined} />);
    const viewport = container.querySelector<HTMLElement>(".admin-hierarchy-tree-wrap")!;
    Object.defineProperties(viewport, { clientHeight: { configurable: true, value: 500 }, clientWidth: { configurable: true, value: 200 }, scrollTop: { configurable: true, value: 10 }, scrollLeft: { configurable: true, value: 20 } });
    fireEvent.click(screen.getByRole("button", { name: "Collapse One & Two" }));
    expect(screen.queryByText("Child")).not.toBeInTheDocument();

    rerender(<HierarchyTree tree={TREE} selectedNodeId="partner:one:two" focusRequest={{ userId: "child", requestId: 1 }} onSelectNode={() => undefined} />);
    expect(screen.getByText("Child")).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({ top: 180, left: 60 });
  });

  it("cleans up panning after pointer cancellation and blocks native drag", () => {
    const onSelect = vi.fn();
    const { container } = render(<HierarchyCanvas tree={TREE} selectedNodeId={null} onSelectNode={onSelect} />);
    const viewport = container.querySelector<HTMLElement>(".admin-hierarchy-viewport")!;
    Object.assign(viewport, { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true), releasePointerCapture: vi.fn() });

    const backgroundPointerDown = createEvent.pointerDown(viewport, { button: 0, pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent(viewport, backgroundPointerDown);
    expect(backgroundPointerDown.defaultPrevented).toBe(true);
    expect(viewport).toHaveClass("admin-hierarchy-viewport-panning");
    expect(fireEvent.dragStart(viewport)).toBe(false);
    fireEvent.pointerCancel(viewport, { pointerId: 1 });
    expect(viewport).not.toHaveClass("admin-hierarchy-viewport-panning");
    expect(viewport.releasePointerCapture).toHaveBeenCalled();

    const tile = screen.getByRole("button", { name: /One & Two/ });
    const tilePointerDown = createEvent.pointerDown(tile, { button: 0, pointerId: 2 });
    fireEvent(tile, tilePointerDown);
    expect(tilePointerDown.defaultPrevented).toBe(false);
    expect(viewport).not.toHaveClass("admin-hierarchy-viewport-panning");
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalledWith("partner:one:two");
  });
});
