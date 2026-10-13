import { describe, expect, it } from "vitest";
import { filterAgentTodos, validateAgentDesignation } from "../../supabase/functions/_shared/agentDesignation";
import { filterPortalTodosForAgent, derivePortalPhase, isStageLocked, type PortalTodo } from "./portal-todos";

const steps: PortalTodo[] = [
  ...["ica_setup", "profile_setup", "drivers_license", "disclosures"].map((id) => ({ id, completed: true })),
  ...["w9_setup", "direct_deposit_setup", "comp_agreement"].map((id) => ({ id, completed: false })),
].map((step) => ({ ...step, title: step.id, description: "", href: "", external: false, actionLabel: "", phase: "on_board", completionType: "auto" }));
steps.push({ ...steps[0], id: "schedule_exam", phase: "pre_license", completed: false });

describe("IBO onboarding requirements", () => {
  it("unlocks pre-license for an IBO without payment paperwork while preserving ICA and compliance", () => {
    const todos = filterPortalTodosForAgent(steps, "ibo");
    expect(todos.map((step) => step.id)).toEqual(["ica_setup", "profile_setup", "drivers_license", "disclosures", "schedule_exam"]);
    expect(derivePortalPhase(todos)).toBe("pre_license");
    expect(isStageLocked(todos, 1)).toBe(false);
    const unfinished = todos.map((todo) => todo.id === "ica_setup" ? { ...todo, completed: false } : todo);
    expect(isStageLocked(unfinished, 1)).toBe(true);
  });

  it.each(["loa", undefined, "unexpected"])("preserves the existing checklist for %s", (designation) => {
    const todos = filterPortalTodosForAgent(steps, designation);
    expect(todos).toEqual(steps);
    expect(isStageLocked(todos, 1)).toBe(true);
  });

  it("uses identical requirements for the server progress totals and browser checklist", () => {
    const records = steps.map((todo) => ({ ...todo, slug: todo.id }));
    expect(filterAgentTodos(records, "ibo").map((todo) => todo.slug))
      .toEqual(filterPortalTodosForAgent(steps, "ibo").map((todo) => todo.id));
  });

  it("does not erase completion records when switching designation", () => {
    filterPortalTodosForAgent(steps, "ibo");
    expect(filterPortalTodosForAgent(steps, "loa")).toEqual(steps);
  });

  it("rejects invalid admin designation changes", () => {
    expect(validateAgentDesignation("ibo")).toBe("ibo");
    expect(() => validateAgentDesignation("admin")).toThrow("IBO or LOA");
    expect(() => validateAgentDesignation(null)).toThrow("IBO or LOA");
  });
});
