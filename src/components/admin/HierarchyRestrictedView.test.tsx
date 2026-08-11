import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HierarchyAssistDetailModal } from "@/components/admin/HierarchyAssistDetailModal";
import { HierarchyCanvas } from "@/components/admin/HierarchyCanvas";
import { HierarchyTree } from "@/components/admin/HierarchyTree";
import type { AssistHierarchyNode } from "@/lib/admin-api";

const TREE: AssistHierarchyNode[] = [{
  id: "raychel",
  name: "Raychel Weidler",
  email: "raychel@thepncl.com",
  npn: "12345678",
  referrerName: "Upline Agent",
  referrerEmail: "upline@thepncl.com",
  referrerNpn: "87654321",
  children: [{
    id: "downline",
    name: "Downline Agent",
    email: "downline@thepncl.com",
    npn: null,
    referrerName: "Raychel Weidler",
    referrerEmail: "raychel@thepncl.com",
    referrerNpn: "12345678",
    children: [],
  }],
}];

describe("restricted hierarchy view", () => {
  it("renders name and NPN on canvas nodes that open read-only details", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <HierarchyCanvas
        tree={TREE}
        selectedNodeId={null}
        assistView
        onSelectNode={onSelect}
      />,
    );

    expect(screen.getByText("Raychel Weidler")).toBeInTheDocument();
    expect(screen.getByText("NPN 12345678")).toBeInTheDocument();
    expect(container.querySelector(".admin-hierarchy-tile-assist")?.tagName).toBe("BUTTON");
    fireEvent.click(screen.getByRole("button", { name: "View hierarchy details for Raychel Weidler" }));
    expect(onSelect).toHaveBeenCalledWith("raychel");
    expect(container).not.toHaveTextContent(/tier|effective/i);
  });

  it("keeps expand controls and lets assistants inspect nodes in tree view", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <HierarchyTree
        tree={TREE}
        selectedNodeId={null}
        assistView
        onSelectNode={onSelect}
      />,
    );

    expect(screen.getByText("Raychel Weidler")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View hierarchy details for Raychel Weidler" }));
    expect(onSelect).toHaveBeenCalledWith("raychel");
    expect(container).not.toHaveTextContent(/tier|effective/i);
  });

  it("shows the allowed person, upline, and downline fields without compensation", () => {
    const { container } = render(
      <HierarchyAssistDetailModal
        node={TREE[0]}
        onClose={() => undefined}
        onFocusAgent={() => undefined}
      />,
    );

    expect(screen.getAllByText("raychel@thepncl.com").length).toBeGreaterThan(0);
    expect(screen.getByText("12345678")).toBeInTheDocument();
    expect(screen.getByText("Upline Agent (upline@thepncl.com)")).toBeInTheDocument();
    expect(screen.getByText(/87654321/)).toBeInTheDocument();
    expect(screen.getByText("Direct downline")).toBeInTheDocument();
    expect(screen.getByText("Total downline")).toBeInTheDocument();
    expect(screen.getByText("Downline Agent")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/comp|tier|effective/i);
  });
});
