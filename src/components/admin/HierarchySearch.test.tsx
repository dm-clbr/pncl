import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HierarchySearch, type HierarchySearchOption } from "@/components/admin/HierarchySearch";

const OPTIONS: HierarchySearchOption[] = [
  { id: "jose", name: "José Álvarez", email: "jose@thepncl.com", npn: "001234", agentNumber: "A-17" },
  { id: "alex-one", name: "Alex Smith", email: "alex.one@thepncl.com", npn: "44", agentNumber: "A-18" },
  { id: "alex-two", name: "Alex Smith", email: "alex.two@thepncl.com", npn: "45", agentNumber: "A-19" },
];

function renderSearch(props: Partial<React.ComponentProps<typeof HierarchySearch>> = {}) {
  const onLocate = vi.fn();
  const onClear = vi.fn();
  render(<HierarchySearch options={OPTIONS} assistView={false} disabled={false} onLocate={onLocate} onClear={onClear} {...props} />);
  return { onLocate, onClear, input: screen.getByRole("combobox", { name: "Find an agent" }) };
}

describe("HierarchySearch", () => {
  it("normalizes accents and whitespace, and allows keyboard selection among duplicate names", () => {
    const { input, onLocate } = renderSearch();
    fireEvent.change(input, { target: { value: "  jose   alvarez " } });
    expect(screen.getByRole("option", { name: /José Álvarez/i })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Alex Smith" } });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onLocate).toHaveBeenCalledWith(expect.objectContaining({ id: "alex-two" }));
  });

  it("locates by email, NPN, agent ID, or mouse choice and reports no result", () => {
    const { input, onLocate } = renderSearch();
    for (const query of ["jose@thepncl.com", "001234", "A-17"]) {
      fireEvent.change(input, { target: { value: query } });
      expect(screen.getByRole("option", { name: /José Álvarez/i })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("option", { name: /José Álvarez/i }));
    expect(onLocate).toHaveBeenLastCalledWith(expect.objectContaining({ id: "jose" }));

    fireEvent.change(input, { target: { value: "does not exist" } });
    expect(screen.getByRole("status")).toHaveTextContent("No agents found");
  });

  it("does not expose or match email in restricted mode even if an unsafe caller passes it", () => {
    const { input } = renderSearch({
      assistView: true,
      options: [{ id: "safe", name: "Safe Agent", email: "private@thepncl.com", npn: "901" }],
    });
    expect(input).toHaveAttribute("placeholder", "Search name or NPN");
    fireEvent.change(input, { target: { value: "private@thepncl.com" } });
    expect(screen.getByRole("status")).toHaveTextContent("No agents found");
    fireEvent.change(input, { target: { value: "901" } });
    expect(screen.getByRole("option", { name: /Safe Agent/i })).not.toHaveTextContent("private@thepncl.com");
  });
});
