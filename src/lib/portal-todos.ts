import type { User } from "@supabase/supabase-js";
import { fetchPortalCompAttachments } from "@/lib/portal-comp-attachments";
import { getSupabaseClient, getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

export const COMP_AGREEMENT_TODO_ID = "comp_agreement";

export type PortalTodoPhase = "on_board" | "pre_license" | "licensing" | "sales_ready";
export type PortalTodoCompletionType = "auto" | "agent" | "admin";

export interface PortalTodo {
  id: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  actionLabel: string;
  showEmailHint?: boolean;
  phase: PortalTodoPhase;
  completionType: PortalTodoCompletionType;
  /** Gated steps stay visible but locked until every earlier step in the same stage is complete. */
  gated?: boolean;
  /** Server-resolved completion (auto rules + manual check-offs). */
  completed?: boolean;
}

export const PORTAL_TODO_PHASES: { id: PortalTodoPhase; label: string }[] = [
  { id: "on_board", label: "On-Board" },
  { id: "pre_license", label: "Pre-License" },
  { id: "licensing", label: "Licensing" },
  { id: "sales_ready", label: "Sales Ready" },
];

/** An agent's current stage: first stage with an incomplete step, or complete. */
export type PortalPhaseId = PortalTodoPhase | "complete";

export const PORTAL_PHASE_LABELS: Record<PortalPhaseId, string> = {
  on_board: "On-Board",
  pre_license: "Pre-License",
  licensing: "Licensing",
  sales_ready: "Sales Ready",
  complete: "Sales Ready ✓",
};

/** Derives the current stage from todos whose `completed` is already resolved. */
export function derivePortalPhase(todos: PortalTodo[]): PortalPhaseId {
  if (todos.length === 0) return "on_board";
  for (const { id } of PORTAL_TODO_PHASES) {
    const items = todos.filter((todo) => todo.phase === id);
    if (items.some((todo) => !todo.completed)) return id;
  }
  return "complete";
}

/** Index of the first stage with an incomplete todo, or null when all are done. */
export function getCurrentStageIndex(todos: PortalTodo[]): number | null {
  for (let index = 0; index < PORTAL_TODO_PHASES.length; index += 1) {
    const { id } = PORTAL_TODO_PHASES[index];
    const items = todos.filter((todo) => todo.phase === id);
    if (items.length === 0) continue;
    if (items.some((todo) => !todo.completed)) return index;
  }
  return null;
}

export function isStageLocked(todos: PortalTodo[], stageIndex: number): boolean {
  const currentIndex = getCurrentStageIndex(todos);
  if (currentIndex === null) return false;
  return stageIndex > currentIndex;
}

/**
 * A gated todo is locked until every earlier step (by list order) in the same
 * stage is complete. Todos arrive sorted by sort_order from the server.
 */
export function isTodoGateLocked(todos: PortalTodo[], todoId: string): boolean {
  const index = todos.findIndex((entry) => entry.id === todoId);
  if (index < 0) return false;
  const todo = todos[index];
  if (!todo.gated || todo.completed) return false;
  return todos.some(
    (entry, entryIndex) =>
      entryIndex < index && entry.phase === todo.phase && !entry.completed,
  );
}

export function canCompleteTodo(todos: PortalTodo[], todoId: string): boolean {
  const todo = todos.find((entry) => entry.id === todoId);
  if (!todo) return false;
  if (isTodoGateLocked(todos, todoId)) return false;
  const stageIndex = PORTAL_TODO_PHASES.findIndex((stage) => stage.id === todo.phase);
  if (stageIndex < 0) return true;
  return !isStageLocked(todos, stageIndex);
}

/** Fallback when the API is unavailable (local dev without migration). */
export const FALLBACK_PORTAL_TODOS: PortalTodo[] = [
  {
    id: "ica_setup",
    title: "Sign your Independent Contractor Agreement",
    description:
      "Review and sign the PNCL Independent Contractor Agreement. A signed PDF is saved to your profile and is required before you can get started.",
    href: "/portal/ica",
    external: false,
    actionLabel: "Review and sign agreement",
    showEmailHint: false,
    phase: "on_board",
    completionType: "auto",
  },
  {
    id: "w9_setup",
    title: "Complete your W-9 form",
    description:
      "Submit your IRS Form W-9 so PNCL can process commission payments. This is required before you can get started.",
    href: "/portal/w9",
    external: false,
    actionLabel: "Fill out W-9",
    showEmailHint: false,
    phase: "on_board",
    completionType: "auto",
  },
  {
    id: "direct_deposit_setup",
    title: "Set up direct deposit",
    description:
      "Submit your direct deposit request so PNCL can pay commissions straight to your bank account. A signed PDF is saved to your profile.",
    href: "/portal/direct-deposit",
    external: false,
    actionLabel: "Fill out direct deposit form",
    showEmailHint: false,
    phase: "on_board",
    completionType: "auto",
  },
  {
    id: "leadspply_account",
    title: "Create your LeadSpply account",
    description:
      "Sign up at LeadSpply using your @thepncl.com email so leads and quotes stay tied to your PNCL account.",
    href: "https://leadspply.com/register",
    external: true,
    actionLabel: "Go to LeadSpply",
    phase: "sales_ready",
    completionType: "agent",
  },
  {
    id: "discord_account",
    title: "Create a Discord account and join the PNCL server",
    description:
      "Set up Discord (or sign in if you already have an account), then join our community server for announcements, training, and support.",
    href: "https://discord.gg/aHqQDtTmp",
    external: true,
    actionLabel: "Join Discord",
    showEmailHint: false,
    phase: "sales_ready",
    completionType: "agent",
  },
  {
    id: "instagram_follow",
    title: "Follow PNCL on Instagram",
    description: "Follow @thepncl_ on Instagram for updates, culture posts, and agent highlights.",
    href: "https://www.instagram.com/thepncl_/",
    external: true,
    actionLabel: "Follow on Instagram",
    showEmailHint: false,
    phase: "sales_ready",
    completionType: "agent",
  },
  {
    id: "linkedin_follow",
    title: "Follow PNCL on LinkedIn",
    description: "Follow The PNCL on LinkedIn to stay connected with company news and opportunities.",
    href: "https://www.linkedin.com/company/the-pncl/?viewAsMember=true",
    external: true,
    actionLabel: "Follow on LinkedIn",
    showEmailHint: false,
    phase: "sales_ready",
    completionType: "agent",
  },
  {
    id: "facebook_follow",
    title: "Follow PNCL on Facebook",
    description: "Like and follow PNCL on Facebook for announcements and community updates.",
    href: "https://www.facebook.com/profile.php?id=61588062292202",
    external: true,
    actionLabel: "Follow on Facebook",
    showEmailHint: false,
    phase: "sales_ready",
    completionType: "agent",
  },
];

interface PortalTodoResponse {
  id: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  actionLabel: string;
  showEmailHint: boolean;
  phase?: PortalTodoPhase;
  completionType?: PortalTodoCompletionType;
  gated?: boolean;
  completed?: boolean;
}

function mapPortalTodo(row: PortalTodoResponse): PortalTodo {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    href: row.href,
    external: row.external,
    actionLabel: row.actionLabel,
    showEmailHint: row.showEmailHint,
    phase: row.phase ?? "on_board",
    completionType: row.completionType ?? "agent",
    gated: row.gated ?? false,
    completed: row.completed,
  };
}

export async function fetchPortalTodos(accessToken: string): Promise<PortalTodo[]> {
  if (!isSupabaseAuthConfigured()) {
    return FALLBACK_PORTAL_TODOS;
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/list-portal-todos`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to load to-dos");
  }

  const todos = (data.todos ?? []) as PortalTodoResponse[];
  const mapped = todos.length > 0 ? todos.map(mapPortalTodo) : FALLBACK_PORTAL_TODOS;
  return filterCompAgreementTodo(accessToken, mapped);
}

async function filterCompAgreementTodo(
  accessToken: string,
  todos: PortalTodo[],
): Promise<PortalTodo[]> {
  if (!todos.some((todo) => todo.id === COMP_AGREEMENT_TODO_ID)) {
    return todos;
  }

  try {
    const attachments = await fetchPortalCompAttachments(accessToken);
    if (attachments.length > 0) {
      return todos;
    }
  } catch {
    // If comp attachments can't be loaded, hide the step so agents aren't blocked.
  }

  return todos.filter((todo) => todo.id !== COMP_AGREEMENT_TODO_ID);
}

type CompletedPortalTodos = Record<string, boolean>;

function getCompletedTodos(user: User | null): CompletedPortalTodos {
  const value = user?.user_metadata?.completed_portal_todos;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as CompletedPortalTodos;
}

export function isPortalTodoCompleted(user: User | null, todoId: string): boolean {
  return getCompletedTodos(user)[todoId] === true;
}

export const REQUIRED_FORM_TODO_IDS = ["ica_setup", "w9_setup", "direct_deposit_setup"] as const;

export function isRequiredFormTodo(todoId: string): boolean {
  return (REQUIRED_FORM_TODO_IDS as readonly string[]).includes(todoId);
}

export interface ResolveTodoOptions {
  icaSubmitted?: boolean;
  w9Submitted?: boolean;
  directDepositSubmitted?: boolean;
}

/**
 * Combines the server-resolved completion with local signals: metadata
 * check-offs (fresh after completePortalTodo) and the form hooks used as a
 * fallback when the API doesn't report completion.
 */
export function isTodoCompleted(
  user: User | null,
  todo: PortalTodo,
  options?: ResolveTodoOptions,
): boolean {
  if (todo.completed) return true;
  if (todo.id === "ica_setup" && options?.icaSubmitted) return true;
  if (todo.id === "w9_setup" && options?.w9Submitted) return true;
  if (todo.id === "direct_deposit_setup" && options?.directDepositSubmitted) return true;
  return isPortalTodoCompleted(user, todo.id);
}

export function getPendingPortalTodos(
  user: User | null,
  todos: PortalTodo[],
  options?: ResolveTodoOptions,
): PortalTodo[] {
  return todos.filter((todo) => !isTodoCompleted(user, todo, options));
}

export function groupTodosByPhase(todos: PortalTodo[]): Map<PortalTodoPhase, PortalTodo[]> {
  const groups = new Map<PortalTodoPhase, PortalTodo[]>();
  for (const { id } of PORTAL_TODO_PHASES) {
    groups.set(id, []);
  }
  for (const todo of todos) {
    const group = groups.get(todo.phase) ?? groups.get("on_board")!;
    group.push(todo);
  }
  return groups;
}

export const SUBMIT_NEW_PRODUCER_TODO_ID = "submit_new_producer";

/**
 * Best-effort ping so admins get a "New Producer submission" email when the
 * agent checks off the gated Submit for New Producer step. Server dedupes.
 */
async function notifyNewProducerSubmission(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;

    const { url, anonKey } = getSupabaseConfig();
    await fetch(`${url.replace(/\/$/, "")}/functions/v1/notify-new-producer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch {
    // Notification is best-effort; the check-off itself already succeeded.
  }
}

export async function completePortalTodo(todoId: string, todos: PortalTodo[]): Promise<void> {
  if (isTodoGateLocked(todos, todoId)) {
    throw new Error("Complete the steps above before submitting this one.");
  }
  if (!canCompleteTodo(todos, todoId)) {
    throw new Error("Complete the current stage before working on later steps.");
  }

  const supabase = getSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("You must be signed in to update your to-do list.");
  }

  const completed = {
    ...getCompletedTodos(user),
    [todoId]: true,
  };

  const { error } = await supabase.auth.updateUser({
    data: { completed_portal_todos: completed },
  });

  if (error) throw error;

  if (todoId === SUBMIT_NEW_PRODUCER_TODO_ID) {
    await notifyNewProducerSubmission();
  }
}
