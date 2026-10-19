import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PortalOnboardingChecklist from "@/components/PortalOnboardingChecklist";
import PortalSureLcLinks from "@/components/PortalSureLcLinks";
import { canCompleteTodo, derivePortalPhase, filterPortalTodosForAgent, isTodoCompleted, type PortalTodo } from "@/lib/portal-todos";
import snapshot from "./fixtures/ibo-onboarding-steps.json";

// Published production step inventory, with the new migration applied locally.
const inventory: PortalTodo[] = snapshot.map((r) => ({ id: r.slug, title: r.title, description: r.description,
  href: r.href, actionLabel: r.action_label, external: r.external, showEmailHint: r.show_email_hint,
  showLoa: r.show_loa, showIbo: r.show_ibo, phase: r.phase as PortalTodo["phase"],
  completionType: r.completion_type as PortalTodo["completionType"], gated: r.gated, completed: false }));

describe("Full published onboarding journey", () => {
  it.each(["ibo", "loa"])("advances %s through every stage without skipping prerequisites", (designation) => {
    const todos = filterPortalTodosForAgent(inventory, designation).map((todo) => ({ ...todo }));
    const ids = todos.map((todo) => todo.id);
    for (const id of ["w9_setup", "direct_deposit_setup", "comp_agreement"]) expect(ids.includes(id)).toBe(designation === "loa");
    const tutorialId = designation === "ibo" ? "surelc_tutorial_ibo" : "surelc_tutorial";
    expect(ids.filter((id) => id.startsWith("surelc_tutorial"))).toEqual([tutorialId]);
    expect(ids.indexOf(tutorialId)).toBe(ids.indexOf("record_eo_policy") + 1);
    expect(ids.indexOf("surelc_account_1")).toBe(ids.indexOf(tutorialId) + 1);
    expect(todos.filter((t) => t.phase === "licensing").at(-1)?.id).toBe("submit_new_producer");
    expect(todos.some((t) => t.phase === "new_producer")).toBe(false);
    const onComplete = vi.fn((id: string) => { todos.find((t) => t.id === id)!.completed = true; });
    const view = () => <MemoryRouter><PortalOnboardingChecklist todos={[...todos]} agentEmail="qa@example.invalid" completingTodoId={null} onComplete={onComplete} /></MemoryRouter>;
    const rendered = render(view());
    expect(derivePortalPhase(todos)).toBe("on_board");
    expect(canCompleteTodo(todos, "exam_study_tools")).toBe(false);
    for (const phase of ["on_board", "pre_license", "licensing", "sales_ready"]) {
      expect(derivePortalPhase(todos)).toBe(phase);
      for (const todo of todos.filter((t) => t.phase === phase)) {
        expect(canCompleteTodo(todos, todo.id)).toBe(true);
        if (todo.id === tutorialId) {
          expect(canCompleteTodo(todos, "surelc_account_1")).toBe(false);
          fireEvent.click(screen.getByRole("button", { name: todo.actionLabel }));
          expect(screen.getByRole("dialog", { name: todo.title })).toBeInTheDocument();
          expect(screen.getAllByRole("link", { name: "SureLC quick reference (PDF)" })).toHaveLength(2);
          fireEvent.click(screen.getByRole("button", { name: "Close video" }));
          // Playback itself is covered by the real player event tests; this fixture
          // supplies its verified completion rather than waiting nine minutes.
          todo.completed = true;
        } else if (todo.id.startsWith("surelc_account_")) {
          fireEvent.click(screen.getByRole("button", { name: todo.actionLabel }));
          const warning = screen.getByRole("alertdialog");
          expect(warning).toHaveTextContent("only request the carriers listed under that SureLC");
          if (todo.id === "surelc_account_1") expect(warning).not.toHaveTextContent("Mutual of Omaha");
          if (todo.id === "surelc_account_3") {
            expect(warning).toHaveTextContent("Mutual of Omaha");
            expect(warning).toHaveTextContent("Transamerica");
          }
          fireEvent.click(within(warning).getByRole("button", { name: "Cancel" }));
          fireEvent.click(screen.getByRole("button", { name: new RegExp(todo.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
        } else if (todo.id === "submit_new_producer") {
          expect(canCompleteTodo(todos, "additional_state_licenses")).toBe(false);
          fireEvent.click(screen.getByRole("button", { name: "Submit for New Producer" }));
          const dialog = screen.getByRole("dialog", { name: "Submit for New Producer" });
          expect(dialog).toHaveTextContent("You do not need approved contracts or writing numbers yet");
          const submit = within(dialog).getByRole("button", { name: "Confirm and submit" });
          expect(submit).toBeDisabled();
          fireEvent.click(within(dialog).getByRole("checkbox"));
          fireEvent.click(submit);
          expect(onComplete).toHaveBeenCalledWith(todo.id);
        } else if (todo.completionType === "agent") {
          const row = screen.getByText(todo.title).closest(".pcl-step")!;
          fireEvent.click(within(row as HTMLElement).getByRole("button", { pressed: false }));
        } else {
          // Auto steps are supplied by saved profile/doc/training records. Server
          // validation is tested separately with those sources present/absent.
          todo.completed = true;
        }
        rendered.rerender(view());
      }
    }
    expect(derivePortalPhase(todos)).toBe("complete");
    expect(todos.every((todo) => todo.completed)).toBe(true);
  });

  it("requires the IBO video after an LOA-to-IBO designation change", () => {
    const todos = filterPortalTodosForAgent(inventory, "ibo");
    const tutorial = todos.find((t) => t.id === "surelc_tutorial_ibo")!;
    expect(isTodoCompleted({ user_metadata: { completed_portal_todos: { surelc_tutorial: true } } } as never, tutorial)).toBe(false);
    expect(canCompleteTodo(todos, "surelc_account_1")).toBe(false);
  });

  it("prevents profile links from bypassing the tutorial and warns on repeat visits", () => {
    const todos = filterPortalTodosForAgent(inventory, "ibo");
    const rendered = render(<PortalSureLcLinks todos={todos} />);
    expect(screen.getByRole("button", { name: "Open SureLC #3" })).toBeDisabled();
    todos.find((t) => t.id === "surelc_tutorial_ibo")!.completed = true;
    rendered.rerender(<PortalSureLcLinks todos={todos} />);
    const trigger = screen.getByRole("button", { name: "Open SureLC #3" });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Mutual of Omaha");
    expect(within(dialog).getByRole("link")).toHaveAttribute("href", todos.find((t) => t.id === "surelc_account_3")!.href);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
