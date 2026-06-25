import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

export interface PortalTodo {
  id: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  actionLabel: string;
  showEmailHint?: boolean;
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
  },
  {
    id: "leadspply_account",
    title: "Create your LeadSpply account",
    description:
      "Sign up at LeadSpply using your @thepncl.com email so leads and quotes stay tied to your PNCL account.",
    href: "https://leadspply.com/register",
    external: true,
    actionLabel: "Go to LeadSpply",
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
  },
  {
    id: "instagram_follow",
    title: "Follow PNCL on Instagram",
    description: "Follow @thepncl_ on Instagram for updates, culture posts, and agent highlights.",
    href: "https://www.instagram.com/thepncl_/",
    external: true,
    actionLabel: "Follow on Instagram",
    showEmailHint: false,
  },
  {
    id: "linkedin_follow",
    title: "Follow PNCL on LinkedIn",
    description: "Follow The PNCL on LinkedIn to stay connected with company news and opportunities.",
    href: "https://www.linkedin.com/company/the-pncl/?viewAsMember=true",
    external: true,
    actionLabel: "Follow on LinkedIn",
    showEmailHint: false,
  },
  {
    id: "facebook_follow",
    title: "Follow PNCL on Facebook",
    description: "Like and follow PNCL on Facebook for announcements and community updates.",
    href: "https://www.facebook.com/profile.php?id=61588062292202",
    external: true,
    actionLabel: "Follow on Facebook",
    showEmailHint: false,
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
  return todos.length > 0 ? todos.map(mapPortalTodo) : FALLBACK_PORTAL_TODOS;
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

export function getPendingPortalTodos(
  user: User | null,
  todos: PortalTodo[],
  options?: { icaSubmitted?: boolean; w9Submitted?: boolean; directDepositSubmitted?: boolean },
): PortalTodo[] {
  return todos.filter((todo) => {
    if (todo.id === "ica_setup" && options?.icaSubmitted) {
      return false;
    }
    if (todo.id === "w9_setup" && options?.w9Submitted) {
      return false;
    }
    if (todo.id === "direct_deposit_setup" && options?.directDepositSubmitted) {
      return false;
    }
    return !isPortalTodoCompleted(user, todo.id);
  });
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
