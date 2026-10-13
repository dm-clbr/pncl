import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface PortalTodoAudienceInput {
  id: string;
  showLoa: boolean;
  showIbo: boolean;
}

export function validatePortalTodoAudiences(body: unknown): PortalTodoAudienceInput[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { steps?: unknown }).steps)) {
    throw new Error("Choose onboarding steps to save.");
  }
  const steps = (body as { steps: unknown[] }).steps;
  if (!steps.length || steps.length > 500) throw new Error("Save between 1 and 500 onboarding steps.");
  const ids = new Set<string>();
  return steps.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Invalid onboarding step.");
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)) {
      throw new Error("Invalid onboarding step ID.");
    }
    const id = row.id.toLowerCase();
    if (ids.has(id)) throw new Error("Each onboarding step may only be saved once.");
    ids.add(id);
    if (typeof row.showLoa !== "boolean" || typeof row.showIbo !== "boolean") {
      throw new Error("LOA and IBO selections must be true or false.");
    }
    return { id, showLoa: row.showLoa, showIbo: row.showIbo };
  });
}

export async function savePortalTodoAudiences(
  adminClient: SupabaseClient,
  steps: PortalTodoAudienceInput[],
): Promise<void> {
  const { error } = await adminClient.rpc("set_portal_todo_audiences", {
    settings: steps.map((step) => ({ id: step.id, show_loa: step.showLoa, show_ibo: step.showIbo })),
  });
  if (error) throw new Error(error.message);
}
