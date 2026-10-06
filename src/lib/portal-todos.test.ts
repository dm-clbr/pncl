import { describe, expect, it } from "vitest";
import { canCompleteTodo, completePortalTodo, derivePortalPhase, isTodoGateLocked, PORTAL_TODO_PHASES, type PortalTodo } from "./portal-todos";

function step(id: string, completed = false, gated = false): PortalTodo {
  return { id, title: id, description: "", href: "", external: false, actionLabel: "", phase: "licensing", completionType: "agent", completed, gated };
}

describe("SureLC onboarding gates", () => {
  it("locks all accounts and applications until the tutorial is watched", () => {
    const todos = [step("surelc_tutorial"), step("surelc_account_1", false, true), step("surelc_account_2", false, true), step("surelc_account_3", false, true), step("carrier_applications", false, true)];
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

  it("rejects manually checking off the tutorial without verified playback", async () => {
    await expect(completePortalTodo("surelc_tutorial", [step("surelc_tutorial")])).rejects.toThrow("Watch the full SureLC tutorial");
  });
});
