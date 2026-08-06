import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HierarchyCanvas } from "@/components/admin/HierarchyCanvas";
import { HierarchyTree } from "@/components/admin/HierarchyTree";
import type { AssistHierarchyNode } from "@/lib/admin-api";

const TREE: AssistHierarchyNode[] = [{
  id: "raychel",
  name: "Raychel Weidler",
  npn: "12345678",
  children: [{
    id: "downline",
    name: "Downline Agent",
    npn: null,
    children: [],
  }],
}];

describe("restricted hierarchy view", () => {
  it("renders name and NPN on non-clickable canvas nodes", () => {
    const { container } = render(
      <HierarchyCanvas
        tree={TREE}
        selectedNodeId={null}
        assistView
        onSelectNode={() => undefined}
      />,
    );

    expect(screen.getByText("Raychel Weidler")).toBeInTheDocument();
    expect(screen.getByText("NPN 12345678")).toBeInTheDocument();
    expect(container.querySelector(".admin-hierarchy-tile-assist")?.tagName).toBe("DIV");
    expect(container.querySelector(".admin-hierarchy-tile-assist button")).toBeNull();
    expect(container).not.toHaveTextContent(/tier|effective/i);
  });

  it("keeps expand controls but renders each tree node as read-only content", () => {
    const { container } = render(
      <HierarchyTree
        tree={TREE}
        selectedNodeId={null}
        assistView
        onSelectNode={() => undefined}
      />,
    );

    expect(screen.getByText("Raychel Weidler")).toBeInTheDocument();
    expect(container.querySelector(".admin-tree-select-readonly")?.tagName).toBe("DIV");
    expect(container.querySelector("button.admin-tree-select")).toBeNull();
    expect(container).not.toHaveTextContent(/tier|effective/i);
  });
});
