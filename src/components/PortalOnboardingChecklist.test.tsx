import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PortalOnboardingChecklist from "@/components/PortalOnboardingChecklist";
import type { PortalTodo } from "@/lib/portal-todos";

function todo(overrides: Partial<PortalTodo>): PortalTodo {
  return {
    id: "todo",
    title: "Onboarding step",
    description: "Complete this step.",
    href: "",
    external: false,
    actionLabel: "Open step",
    phase: "licensing",
    completionType: "agent",
    completed: false,
    ...overrides,
  };
}

describe("PortalOnboardingChecklist completed SureLC links", () => {
  it("keeps all three SureLC links actionable after Stage 3 is complete", () => {
    const todos: PortalTodo[] = [
      todo({
        id: "surelc_account_1",
        title: "Create SureLC account #1",
        href: "https://example.com/surelc-1",
        actionLabel: "Open SureLC #1",
        external: true,
        completed: true,
      }),
      todo({
        id: "surelc_account_2",
        title: "Create SureLC account #2",
        href: "https://example.com/surelc-2",
        actionLabel: "Open SureLC #2",
        external: true,
        completed: true,
      }),
      todo({
        id: "surelc_account_3",
        title: "Create SureLC account #3",
        href: "https://example.com/surelc-3",
        actionLabel: "Open SureLC #3",
        external: true,
        completed: true,
      }),
      todo({
        id: "new_producer_step",
        title: "New Producer step",
        phase: "new_producer",
      }),
    ];

    render(
      <MemoryRouter>
        <PortalOnboardingChecklist
          todos={todos}
          agentEmail="agent@thepncl.com"
          completingTodoId={null}
          onComplete={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Licensing/ }));

    for (const accountNumber of [1, 2, 3]) {
      const link = screen.getByRole("link", { name: `Open SureLC #${accountNumber}` });
      expect(link).toHaveAttribute("href", `https://example.com/surelc-${accountNumber}`);
      expect(link).toHaveAttribute("target", "_blank");
    }
  });
});
