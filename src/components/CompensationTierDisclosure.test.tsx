import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CompensationTierDisclosure from "@/components/CompensationTierDisclosure";

describe("CompensationTierDisclosure", () => {
  it("keeps an assigned tier out of the DOM until the agent reveals it", () => {
    render(<CompensationTierDisclosure tier={105} />);

    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.queryByText("Tier 105")).not.toBeInTheDocument();

    const showButton = screen.getByRole("button", { name: "Show compensation tier" });
    expect(showButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(showButton);

    expect(screen.getByText("Tier 105")).toBeInTheDocument();
    const hideButton = screen.getByRole("button", { name: "Hide compensation tier" });
    expect(hideButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(hideButton);

    expect(screen.queryByText("Tier 105")).not.toBeInTheDocument();
  });

  it("shows an unassigned state without a meaningless reveal control", () => {
    render(<CompensationTierDisclosure tier={null} />);

    expect(screen.getByText("Not assigned")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
