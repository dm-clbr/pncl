import { describe, expect, it } from "vitest";
import {
  DEFAULT_SURELC_ACCOUNT_LINKS,
  isSureLcAccountTodo,
  resolveSureLcAccountLinks,
} from "@/lib/surelc-accounts";
import type { PortalTodo } from "@/lib/portal-todos";

function sureLcTodo(overrides: Partial<PortalTodo> = {}): PortalTodo {
  return {
    id: "surelc_account_2",
    title: "Create SureLC account #2",
    description: "Create your second SureLC account.",
    href: "https://example.com/published-surelc-2",
    external: true,
    actionLabel: "Reopen account #2",
    showEmailHint: false,
    phase: "licensing",
    completionType: "agent",
    completed: true,
    ...overrides,
  };
}

describe("SureLC account links", () => {
  it("defines all three account links in account order", () => {
    expect(DEFAULT_SURELC_ACCOUNT_LINKS.map((link) => link.todoId)).toEqual([
      "surelc_account_1",
      "surelc_account_2",
      "surelc_account_3",
    ]);
    expect(DEFAULT_SURELC_ACCOUNT_LINKS.every((link) => link.href.startsWith("https://"))).toBe(true);
  });

  it("uses a published onboarding link while retaining defaults for missing todos", () => {
    const links = resolveSureLcAccountLinks([sureLcTodo()]);

    expect(links).toHaveLength(3);
    expect(links[1]).toMatchObject({
      todoId: "surelc_account_2",
      href: "https://example.com/published-surelc-2",
      actionLabel: "Reopen account #2",
    });
    expect(links[0].href).toBe(DEFAULT_SURELC_ACCOUNT_LINKS[0].href);
    expect(links[2].href).toBe(DEFAULT_SURELC_ACCOUNT_LINKS[2].href);
  });

  it("only identifies the three SureLC account onboarding steps", () => {
    expect(isSureLcAccountTodo("surelc_account_1")).toBe(true);
    expect(isSureLcAccountTodo("surelc_account_3")).toBe(true);
    expect(isSureLcAccountTodo("surelc_tutorial")).toBe(false);
  });
});
