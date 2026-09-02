import { act, fireEvent, render, screen } from "@testing-library/react";
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

describe("PortalOnboardingChecklist tutorial video", () => {
  const tutorialUrl = "https://player.mediadelivery.net/play/687293/tutorial-video-id";

  function renderTutorial() {
    render(
      <div className="home2-page">
        <div className="portal-checklist-drawer open">
          <MemoryRouter>
            <PortalOnboardingChecklist
              todos={[
                todo({
                  id: "surelc_tutorial",
                  title: "Watch the SureLC tutorial video",
                  href: tutorialUrl,
                  actionLabel: "Watch tutorial video",
                  external: true,
                }),
              ]}
              agentEmail="agent@thepncl.com"
              completingTodoId={null}
              onComplete={vi.fn()}
            />
          </MemoryRouter>
        </div>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Watch tutorial video" }));
  }

  it("uses a click-to-play embed and always provides a direct fallback", () => {
    renderTutorial();

    const dialog = screen.getByRole("dialog", { name: "Watch the SureLC tutorial video" });
    expect(dialog.closest(".portal-checklist-drawer")).toBeNull();
    expect(dialog.parentElement?.parentElement).toHaveClass("home2-page");
    expect(dialog.parentElement).toHaveClass("portal-video-overlay");
    expect(screen.getByRole("status")).toHaveTextContent("Loading video");

    const frame = screen.getByTitle("Watch the SureLC tutorial video");
    expect(frame).toHaveAttribute(
      "src",
      "https://iframe.mediadelivery.net/embed/687293/tutorial-video-id",
    );
    expect(frame.getAttribute("src")).not.toContain("autoplay");

    const fallback = screen.getByRole("link", { name: /Open video in a new tab/i });
    expect(fallback).toHaveAttribute("href", tutorialUrl);
    expect(fallback).toHaveAttribute("target", "_blank");
    expect(fallback).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.load(frame);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a useful recovery message if the embedded player stays blank", () => {
    vi.useFakeTimers();
    try {
      renderTutorial();

      act(() => vi.advanceTimersByTime(8_000));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "The embedded player could not load",
      );
      expect(screen.getByRole("link", { name: /Open video in a new tab/i })).toHaveAttribute(
        "href",
        tutorialUrl,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
