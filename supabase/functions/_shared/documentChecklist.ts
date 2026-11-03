import { canonicalStepSlug, type FlowRules } from "./onboardingEditorRules.ts";

type ChecklistItem = { id: string; stepSlug?: string; prerequisites?: string[] };
/** Linked requests occupy their step's position and satisfy its dependencies. */
export function mergeDocumentChecklist<T extends ChecklistItem, U extends ChecklistItem>(todos: T[], documents: U[], rules: FlowRules): (T | U)[] {
  const combined = [...todos, ...documents];
  const canonical = (item: T | U) => canonicalStepSlug(item.stepSlug ?? item.id);
  const rank = (item: T | U) => {
    const index = rules.portalOrder.indexOf(canonical(item));
    if (index >= 0) return index;
    const ordinaryIndex = todos.findIndex(todo => canonical(todo) === canonical(item));
    return 10000 + (ordinaryIndex < 0 ? todos.length : ordinaryIndex);
  };
  combined.sort((a, b) => rank(a) - rank(b));
  return combined.map(item => ({ ...item, prerequisites: (rules.prerequisites[canonical(item)] ?? item.prerequisites ?? [])
    .flatMap(slug => combined.filter(candidate => candidate.id !== item.id && canonical(candidate) === canonicalStepSlug(slug)).map(candidate => candidate.id)) }));
}
