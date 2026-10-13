export type AgentDesignation = "loa" | "ibo";

/** A missing designation retains the existing LOA checklist. */
export function resolveAgentDesignation(value: unknown): AgentDesignation {
  return value === "ibo" ? "ibo" : "loa";
}

export function validateAgentDesignation(value: unknown): AgentDesignation {
  if (value !== "ibo" && value !== "loa") {
    throw new Error("Agent designation must be IBO or LOA.");
  }
  return value;
}

const IBO_EXCLUDED_STEPS = new Set(["w9_setup", "direct_deposit_setup", "comp_agreement"]);

export interface TodoAudienceSettings {
  show_loa?: boolean;
  show_ibo?: boolean;
  showLoa?: boolean;
  showIbo?: boolean;
}

export function isTodoApplicableToAgent(
  slug: string,
  designation: unknown,
  settings: TodoAudienceSettings = {},
): boolean {
  if (resolveAgentDesignation(designation) === "ibo") {
    return settings.show_ibo ?? settings.showIbo ?? !IBO_EXCLUDED_STEPS.has(slug);
  }
  return settings.show_loa ?? settings.showLoa ?? true;
}

export function filterAgentTodos<T extends { slug: string } & TodoAudienceSettings>(todos: T[], designation: unknown): T[] {
  return todos.filter((todo) => isTodoApplicableToAgent(todo.slug, designation, todo));
}
