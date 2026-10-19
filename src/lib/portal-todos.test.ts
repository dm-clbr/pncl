import { describe, expect, it } from "vitest";
import { canCompleteTodo, completePortalTodo, derivePortalPhase, filterPortalTodosForAgent, isTodoCompleted, isTodoGateLocked, PORTAL_TODO_PHASES, type PortalTodo } from "./portal-todos";
import type { User } from "@supabase/supabase-js";

function step(id: string, completed = false, gated = false): PortalTodo {
  return { id, title: id, description: "", href: "", external: false, actionLabel: "", phase: "licensing", completionType: "agent", completed, gated };
}

describe("SureLC onboarding gates", () => {
  it.each(["surelc_tutorial", "surelc_tutorial_ibo"])("locks all accounts and applications until %s is watched", (tutorialId) => {
    const todos = [step(tutorialId), step("surelc_account_1", false, true), step("surelc_account_2", false, true), step("surelc_account_3", false, true), step("carrier_applications", false, true)];
    for (const todo of todos.slice(1)) expect(canCompleteTodo(todos, todo.id)).toBe(false);
    todos[0].completed = true;
    for (const todo of todos.slice(1)) expect(canCompleteTodo(todos, todo.id)).toBe(true);
  });

  it("requires every licensing step before producer submission and then unlocks Sales Ready", () => {
    const todos = [step("record_eo_policy", true), step("surelc_tutorial", true), step("surelc_account_1", true), step("carrier_applications"), step("submit_new_producer", false, true), { ...step("sales_step"), phase: "sales_ready" as const }];
    expect(isTodoGateLocked(todos, "submit_new_producer")).toBe(true);
    expect(canCompleteTodo(todos, "sales_step")).toBe(false);
    todos[3].completed = true;
    expect(canCompleteTodo(todos, "submit_new_producer")).toBe(true);
    todos[4].completed = true;
    expect(derivePortalPhase(todos)).toBe("sales_ready");
    expect(canCompleteTodo(todos, "sales_step")).toBe(true);
    expect(PORTAL_TODO_PHASES.map((phase) => phase.id)).toEqual(["on_board", "pre_license", "licensing", "sales_ready"]);
  });

  it.each(["surelc_tutorial", "surelc_tutorial_ibo"])("rejects manually checking off %s without verified playback", async (tutorialId) => {
    await expect(completePortalTodo(tutorialId, [step(tutorialId)])).rejects.toThrow("Watch the full SureLC tutorial");
  });

  it("uses each audience's own tutorial and keeps LOA completion from satisfying IBO playback", () => {
    const tutorials = [
      { ...step("surelc_tutorial"), showLoa: true, showIbo: false },
      { ...step("surelc_tutorial_ibo"), showLoa: false, showIbo: true },
    ];
    expect(filterPortalTodosForAgent(tutorials, "loa").map(t => t.id)).toEqual(["surelc_tutorial"]);
    const ibo = filterPortalTodosForAgent(tutorials, "ibo");
    expect(ibo.map(t => t.id)).toEqual(["surelc_tutorial_ibo"]);
    const user = { user_metadata: { completed_portal_todos: { surelc_tutorial: true } } } as User;
    expect(isTodoCompleted(user, ibo[0])).toBe(false);
    expect(canCompleteTodo([...ibo, step("surelc_account_1")], "surelc_account_1")).toBe(false);
  });
});
