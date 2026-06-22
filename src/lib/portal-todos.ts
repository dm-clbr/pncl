import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

export interface PortalTodo {
  id: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  actionLabel: string;
}

export const PORTAL_TODOS: PortalTodo[] = [
  {
    id: "leadspply_account",
    title: "Create your LeadSpply account",
    description:
      "Sign up at LeadSpply using your @thepncl.com email so leads and quotes stay tied to your PNCL account.",
    href: "https://leadspply.com/register",
    external: true,
    actionLabel: "Go to LeadSpply",
  },
];

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

export function getPendingPortalTodos(user: User | null): PortalTodo[] {
  return PORTAL_TODOS.filter((todo) => !isPortalTodoCompleted(user, todo.id));
}

export async function completePortalTodo(todoId: string): Promise<void> {
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
}
