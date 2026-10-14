import { describe, expect, it } from "vitest";
import { isTodoCompleted, type PortalTodo } from "@/lib/portal-todos";

const legacyTrainingUser = {
  user_metadata: { completed_portal_todos: { disclosures: true, welcome: true } },
} as never;

function todo(overrides: Partial<PortalTodo>): PortalTodo {
  return {
    id: "welcome",
    title: "Welcome",
    description: "",
    href: "/portal/welcome",
    external: false,
    actionLabel: "Complete",
    phase: "on_board",
    completionType: "agent",
    ...overrides,
  };
}

describe("portal to-do completion", () => {
  it("uses the server result for automatic disclosures instead of legacy metadata", () => {
    expect(isTodoCompleted(legacyTrainingUser, todo({
      id: "disclosures",
      completionType: "auto",
      completed: false,
    }))).toBe(false);

    expect(isTodoCompleted(legacyTrainingUser, todo({
      id: "disclosures",
      completionType: "auto",
      completed: true,
    }))).toBe(true);

    expect(isTodoCompleted(legacyTrainingUser, todo({
      id: "disclosures",
      completionType: "auto",
    }))).toBe(false);
  });

  it("keeps metadata completion behavior for unrelated to-dos", () => {
    expect(isTodoCompleted(legacyTrainingUser, todo({ completed: false }))).toBe(true);
  });
});
