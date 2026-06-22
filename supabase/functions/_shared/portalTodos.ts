import type { User } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface PortalTodoRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  action_label: string;
  show_email_hint: boolean;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertPortalTodoPayload {
  id?: string;
  slug?: string;
  title: string;
  description: string;
  href: string;
  external?: boolean;
  actionLabel: string;
  showEmailHint?: boolean;
  published?: boolean;
  sortOrder?: number;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "todo";
}

export function validateUpsertPortalTodoPayload(body: unknown): UpsertPortalTodoPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) {
    throw new Error("Title is required");
  }

  const description = typeof data.description === "string" ? data.description.trim() : "";
  if (!description) {
    throw new Error("Description is required");
  }

  const href = typeof data.href === "string" ? data.href.trim() : "";
  if (!href) {
    throw new Error("Link URL is required");
  }

  const actionLabel = typeof data.actionLabel === "string" ? data.actionLabel.trim() : "";
  if (!actionLabel) {
    throw new Error("Action label is required");
  }

  const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : undefined;
  const slugInput = typeof data.slug === "string" ? data.slug.trim() : "";
  const slug = slugInput || slugify(title);
  const external = typeof data.external === "boolean" ? data.external : true;
  const showEmailHint = typeof data.showEmailHint === "boolean" ? data.showEmailHint : true;
  const published = typeof data.published === "boolean" ? data.published : true;
  const sortOrder = typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
    ? Math.max(0, Math.floor(data.sortOrder))
    : undefined;

  return {
    id,
    slug,
    title,
    description,
    href,
    external,
    actionLabel,
    showEmailHint,
    published,
    sortOrder,
  };
}

export function mapPortalTodoRecord(row: PortalTodoRecord) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    href: row.href,
    external: row.external,
    actionLabel: row.action_label,
    showEmailHint: row.show_email_hint,
    sortOrder: row.sort_order,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Slug is the completion key stored in user metadata. */
export function mapPortalTodoForUser(row: PortalTodoRecord) {
  return {
    id: row.slug,
    title: row.title,
    description: row.description,
    href: row.href,
    external: row.external,
    actionLabel: row.action_label,
    showEmailHint: row.show_email_hint,
  };
}

function getCompletedTodos(user: User): Record<string, boolean> {
  const value = user.user_metadata?.completed_portal_todos;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, boolean>;
}

export function isPortalTodoCompletedForUser(user: User, slug: string): boolean {
  return getCompletedTodos(user)[slug] === true;
}

export function countTodoCompletions(
  users: User[],
  slugs: string[],
): { totalUsers: number; completionsBySlug: Record<string, number> } {
  const completionsBySlug = Object.fromEntries(slugs.map((slug) => [slug, 0]));

  for (const user of users) {
    const completed = getCompletedTodos(user);
    for (const slug of slugs) {
      if (completed[slug] === true) {
        completionsBySlug[slug] += 1;
      }
    }
  }

  return { totalUsers: users.length, completionsBySlug };
}

export function validateTodoCompletionQuery(url: URL): { todoId: string } {
  const todoId = url.searchParams.get("todoId")?.trim() ?? "";
  if (!todoId) {
    throw new Error("todoId is required");
  }
  return { todoId };
}
