import type { PortalTodo } from "@/lib/portal-todos";
import type { PortalCarrier } from "@/lib/portal-carriers";
import { isAutomaticCarrier } from "@/lib/carrier-applications";

export const SURELC_ACCOUNT_TODO_IDS = [
  "surelc_account_1",
  "surelc_account_2",
  "surelc_account_3",
] as const;

export type SureLcAccountTodoId = (typeof SURELC_ACCOUNT_TODO_IDS)[number];

export interface SureLcAccountLink {
  todoId: SureLcAccountTodoId;
  label: string;
  branch: string;
  href: string;
  actionLabel: string;
}

export const DEFAULT_SURELC_ACCOUNT_LINKS: readonly SureLcAccountLink[] = [
  {
    todoId: "surelc_account_1",
    label: "SureLC #1",
    branch: "Basso Montemurro",
    href: "https://accounts.surancebay.com/oauth/authorize?redirect_uri=https:%2F%2Fsurelc.surancebay.com%2Fproducer%2Foauth%3FreturnUrl%3D%252Fprofile%252Fcontact-info%253FgaId%253D323%2526branch%253DBasso-Montemurro&gaId=323&client_id=surecrmweb&response_type=code",
    actionLabel: "Open SureLC #1",
  },
  {
    todoId: "surelc_account_2",
    label: "SureLC #2",
    branch: "The Pinnacle Life Group",
    href: "https://accounts.surancebay.com/oauth/authorize?redirect_uri=https:%2F%2Fsurelc.surancebay.com%2Fproducer%2Foauth%3FreturnUrl%3D%252Fprofile%252Fcontact-info%253FgaId%253D233%2526gaId%253D233%2526branch%253DJoe%252520Basso%2526branchVisible%253Dtrue%2526branchEditable%253Dfalse%2526branchRequired%253Dtrue%2526autoAdd%253Dfalse%2526requestMethod%253DGET&gaId=233&client_id=surecrmweb&response_type=code",
    actionLabel: "Open SureLC #2",
  },
  {
    todoId: "surelc_account_3",
    label: "SureLC #3",
    branch: "Pinnacle Life Group",
    href: "https://accounts.surancebay.com/oauth/authorize?redirect_uri=https:%2F%2Fsurelc.surancebay.com%2Fproducer%2Foauth%3FreturnUrl%3D%252Fprofile%252Fcontact-info%253FgaId%253D1313%2526gaId%253D1313%2526branchVisible%253Dtrue%2526branchEditable%253Dfalse%2526branchRequired%253Dtrue%2526autoAdd%253Dfalse%2526requestMethod%253DGET&gaId=1313&client_id=surecrmweb&response_type=code",
    actionLabel: "Open SureLC #3",
  },
];

export function isSureLcAccountTodo(todoId: string): todoId is SureLcAccountTodoId {
  return (SURELC_ACCOUNT_TODO_IDS as readonly string[]).includes(todoId);
}

/**
 * Prefer the published onboarding URL so admin-managed link changes flow into
 * the profile. Carrier names are loaded separately from the published Carrier Sheet.
 */
export function resolveSureLcAccountLinks(todos: PortalTodo[]): SureLcAccountLink[] {
  const todoById = new Map(todos.map((todo) => [todo.id, todo]));

  return DEFAULT_SURELC_ACCOUNT_LINKS.map((account) => {
    const todo = todoById.get(account.todoId);
    if (!todo?.href) return { ...account };

    return {
      ...account,
      href: todo.href,
      actionLabel: todo.actionLabel || account.actionLabel,
    };
  });
}

/** Resolve only the published sheet rows belonging to this exact SureLC account. */
export function sureLcCarrierNames(todoId: SureLcAccountTodoId, carriers: PortalCarrier[]): string[] {
  const number = todoId.slice(-1);
  return [...new Set(carriers
    .filter((carrier) => carrier.section.trim().match(/^SureLC\s+#([123])\b/i)?.[1] === number)
    .map((carrier) => carrier.carrier.trim())
    .filter((name) => name && !isAutomaticCarrier(name)))];
}
