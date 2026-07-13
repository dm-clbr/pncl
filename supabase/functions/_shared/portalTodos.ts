import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { listIcaSignedUserIds } from "./portalIca.ts";

export const PORTAL_TODO_PHASES = ["on_board", "pre_license", "licensing", "sales_ready"] as const;
export type PortalTodoPhase = (typeof PORTAL_TODO_PHASES)[number];

export const PORTAL_TODO_COMPLETION_TYPES = ["auto", "agent", "admin"] as const;
export type PortalTodoCompletionType = (typeof PORTAL_TODO_COMPLETION_TYPES)[number];

export const PORTAL_TODO_AUTO_KEYS = [
  "account_created",
  "ica",
  "w9",
  "direct_deposit",
  "profile",
  "drivers_license",
  "npn",
  "eo_policy",
  "state_licenses",
  "writing_numbers",
  "carrier_credentials",
  "disclosures",
] as const;
export type PortalTodoAutoKey = (typeof PORTAL_TODO_AUTO_KEYS)[number];

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
  phase: PortalTodoPhase;
  completion_type: PortalTodoCompletionType;
  auto_key: string | null;
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
  phase: PortalTodoPhase;
  completionType: PortalTodoCompletionType;
  autoKey: string | null;
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
  const actionLabel = typeof data.actionLabel === "string" ? data.actionLabel.trim() : "";
  if (href && !actionLabel) {
    throw new Error("Action label is required when a link URL is set");
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

  const phaseInput = typeof data.phase === "string" ? data.phase.trim() : "";
  const phase = (PORTAL_TODO_PHASES as readonly string[]).includes(phaseInput)
    ? phaseInput as PortalTodoPhase
    : "on_board";

  const completionTypeInput = typeof data.completionType === "string" ? data.completionType.trim() : "";
  const completionType = (PORTAL_TODO_COMPLETION_TYPES as readonly string[]).includes(completionTypeInput)
    ? completionTypeInput as PortalTodoCompletionType
    : "agent";

  const autoKeyInput = typeof data.autoKey === "string" ? data.autoKey.trim() : "";
  if (completionType === "auto" && !(PORTAL_TODO_AUTO_KEYS as readonly string[]).includes(autoKeyInput)) {
    throw new Error("A valid auto-completion rule is required for auto-completed to-dos");
  }
  const autoKey = completionType === "auto" ? autoKeyInput : null;

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
    phase,
    completionType,
    autoKey,
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
    phase: row.phase ?? "on_board",
    completionType: row.completion_type ?? "agent",
    autoKey: row.auto_key ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Slug is the completion key stored in user metadata. */
export function mapPortalTodoForUser(row: PortalTodoRecord, completed: boolean) {
  return {
    id: row.slug,
    title: row.title,
    description: row.description,
    href: row.href,
    external: row.external,
    actionLabel: row.action_label,
    showEmailHint: row.show_email_hint,
    phase: row.phase ?? "on_board",
    completionType: row.completion_type ?? "agent",
    completed,
  };
}

export function getCompletedTodosFromMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, boolean> {
  const value = metadata?.completed_portal_todos;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, boolean>;
}

function collectUserIds(rows: { user_id?: string | null }[] | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    if (row.user_id) ids.add(row.user_id);
  }
  return ids;
}

interface LicensingProfileRow {
  user_id: string;
  npn: string | null;
  eo_policy_number: string | null;
  state_licenses: string[] | null;
  drivers_license_path: string | null;
}

interface CarrierCredentialRow {
  user_id: string;
  username: string | null;
  writing_number: string | null;
}

/**
 * Resolves, for each auto-completion rule, the set of user IDs that satisfy it.
 * Runs one bulk query per data source so it works for a single user or a roster.
 */
export async function computeAutoCompletionSets(
  adminClient: SupabaseClient,
  autoKeys: Set<string>,
  userIds: string[],
): Promise<Map<string, Set<string>>> {
  const sets = new Map<string, Set<string>>();
  if (userIds.length === 0 || autoKeys.size === 0) {
    return sets;
  }

  if (autoKeys.has("account_created")) {
    sets.set("account_created", new Set(userIds));
  }

  const tasks: Promise<void>[] = [];

  if (autoKeys.has("ica")) {
    tasks.push(
      listIcaSignedUserIds(adminClient, userIds).then((ids) => {
        sets.set("ica", ids);
      }),
    );
  }

  if (autoKeys.has("w9")) {
    tasks.push(
      adminClient
        .from("portal_w9_forms")
        .select("user_id")
        .in("user_id", userIds)
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          sets.set("w9", collectUserIds(data));
        }),
    );
  }

  if (autoKeys.has("direct_deposit")) {
    tasks.push(
      adminClient
        .from("portal_direct_deposit_forms")
        .select("user_id")
        .in("user_id", userIds)
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          sets.set("direct_deposit", collectUserIds(data));
        }),
    );
  }

  const profileKeys = ["profile", "drivers_license", "npn", "eo_policy", "state_licenses"];
  if (profileKeys.some((key) => autoKeys.has(key))) {
    tasks.push(
      adminClient
        .from("portal_profiles")
        .select("user_id, npn, eo_policy_number, state_licenses, drivers_license_path")
        .in("user_id", userIds)
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          const rows = (data ?? []) as LicensingProfileRow[];
          sets.set("profile", new Set(rows.map((row) => row.user_id)));
          sets.set(
            "drivers_license",
            new Set(rows.filter((row) => row.drivers_license_path?.trim()).map((row) => row.user_id)),
          );
          sets.set(
            "npn",
            new Set(rows.filter((row) => row.npn?.trim()).map((row) => row.user_id)),
          );
          sets.set(
            "eo_policy",
            new Set(rows.filter((row) => row.eo_policy_number?.trim()).map((row) => row.user_id)),
          );
          sets.set(
            "state_licenses",
            new Set(
              rows
                .filter((row) => Array.isArray(row.state_licenses) && row.state_licenses.length > 0)
                .map((row) => row.user_id),
            ),
          );
        }),
    );
  }

  if (autoKeys.has("disclosures")) {
    tasks.push((async () => {
      const { data: disclosureRows, error: disclosureError } = await adminClient
        .from("portal_disclosures")
        .select("id")
        .eq("published", true);

      if (disclosureError) throw new Error(disclosureError.message);

      const publishedIds = new Set(((disclosureRows ?? []) as { id: string }[]).map((row) => row.id));
      if (publishedIds.size === 0) {
        sets.set("disclosures", new Set());
        return;
      }

      const { data: ackRows, error: ackError } = await adminClient
        .from("portal_disclosure_acknowledgments")
        .select("user_id, disclosure_id")
        .in("user_id", userIds);

      if (ackError) throw new Error(ackError.message);

      const ackCounts = new Map<string, Set<string>>();
      for (const row of (ackRows ?? []) as { user_id: string; disclosure_id: string }[]) {
        if (!publishedIds.has(row.disclosure_id)) continue;
        const acked = ackCounts.get(row.user_id) ?? new Set<string>();
        acked.add(row.disclosure_id);
        ackCounts.set(row.user_id, acked);
      }

      sets.set(
        "disclosures",
        new Set(
          [...ackCounts.entries()]
            .filter(([, acked]) => acked.size >= publishedIds.size)
            .map(([userId]) => userId),
        ),
      );
    })());
  }

  if (autoKeys.has("writing_numbers") || autoKeys.has("carrier_credentials")) {
    tasks.push(
      adminClient
        .from("portal_carrier_credentials")
        .select("user_id, username, writing_number")
        .in("user_id", userIds)
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          const rows = (data ?? []) as CarrierCredentialRow[];
          sets.set(
            "writing_numbers",
            new Set(rows.filter((row) => row.writing_number?.trim()).map((row) => row.user_id)),
          );
          sets.set(
            "carrier_credentials",
            new Set(rows.filter((row) => row.username?.trim()).map((row) => row.user_id)),
          );
        }),
    );
  }

  await Promise.all(tasks);
  return sets;
}

/** Whether a todo is complete for a user, combining auto rules and manual check-offs. */
export function isTodoCompleteForUser(
  row: Pick<PortalTodoRecord, "slug" | "completion_type" | "auto_key">,
  userId: string,
  completedMetadata: Record<string, boolean>,
  autoSets: Map<string, Set<string>>,
): boolean {
  if (completedMetadata[row.slug] === true) {
    return true;
  }
  if (row.completion_type === "auto" && row.auto_key) {
    return autoSets.get(row.auto_key)?.has(userId) ?? false;
  }
  return false;
}

export const PORTAL_TODO_PHASE_LABELS: Record<PortalTodoPhase, string> = {
  on_board: "On-Board",
  pre_license: "Pre-License",
  licensing: "Licensing",
  sales_ready: "Sales Ready",
};

export interface PortalTodoPhaseProgress {
  id: PortalTodoPhase;
  label: string;
  completedCount: number;
  totalCount: number;
}

export interface PortalTodoProgressSummary {
  completedCount: number;
  totalCount: number;
  phases: PortalTodoPhaseProgress[];
}

export async function computePortalTodoProgressByUserId(
  adminClient: SupabaseClient,
  users: Array<{ id: string; user_metadata?: Record<string, unknown> | null }>,
  compAgreementSlug = "comp_agreement",
): Promise<Map<string, PortalTodoProgressSummary>> {
  const progressByUserId = new Map<string, PortalTodoProgressSummary>();
  if (users.length === 0) return progressByUserId;

  const { data, error } = await adminClient
    .from("portal_todos")
    .select("*")
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const todos = (data ?? []) as PortalTodoRecord[];
  if (todos.length === 0) {
    return progressByUserId;
  }

  const userIds = users.map((user) => user.id);
  const hasCompTodo = todos.some((row) => row.slug === compAgreementSlug);
  let usersWithCompAttachment = new Set<string>();

  if (hasCompTodo && userIds.length > 0) {
    const { data: compRows, error: compError } = await adminClient
      .from("portal_comp_attachments")
      .select("user_id")
      .in("user_id", userIds);

    if (compError) {
      throw new Error(compError.message);
    }

    usersWithCompAttachment = new Set(
      (compRows ?? []).map((row) => row.user_id as string),
    );
  }

  const autoKeys = new Set(
    todos
      .filter((row) => row.completion_type === "auto" && row.auto_key)
      .map((row) => row.auto_key as string),
  );
  const autoSets = await computeAutoCompletionSets(adminClient, autoKeys, userIds);

  for (const user of users) {
    const visibleTodos = hasCompTodo && !usersWithCompAttachment.has(user.id)
      ? todos.filter((row) => row.slug !== compAgreementSlug)
      : todos;
    const completedMetadata = getCompletedTodosFromMetadata(user.user_metadata ?? undefined);

    const phases = PORTAL_TODO_PHASES.map((phaseId) => {
      const phaseTodos = visibleTodos.filter((row) => (row.phase ?? "on_board") === phaseId);
      let completedCount = 0;

      for (const todo of phaseTodos) {
        if (isTodoCompleteForUser(todo, user.id, completedMetadata, autoSets)) {
          completedCount += 1;
        }
      }

      return {
        id: phaseId,
        label: PORTAL_TODO_PHASE_LABELS[phaseId],
        completedCount,
        totalCount: phaseTodos.length,
      };
    }).filter((phase) => phase.totalCount > 0);

    const completedCount = phases.reduce((sum, phase) => sum + phase.completedCount, 0);
    const totalCount = phases.reduce((sum, phase) => sum + phase.totalCount, 0);

    progressByUserId.set(user.id, {
      completedCount,
      totalCount,
      phases,
    });
  }

  return progressByUserId;
}

export function validateTodoCompletionQuery(url: URL): { todoId: string } {
  const todoId = url.searchParams.get("todoId")?.trim() ?? "";
  if (!todoId) {
    throw new Error("todoId is required");
  }
  return { todoId };
}
