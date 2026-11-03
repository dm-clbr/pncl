import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface SigningRollout {
  enabled: boolean;
  revision: number;
  legacy_ica_sources: Record<string, string | null>;
  legacy_steps: Array<Record<string, unknown>>;
}
export async function loadSigningRollout(client: SupabaseClient): Promise<SigningRollout> {
  const { data, error } = await client.from("onboarding_signing_rollout").select("enabled,revision,legacy_ica_sources,legacy_steps").eq("id", true).single();
  if (error || !data) throw new Error("Unable to verify signing activation. Please retry.");
  return data;
}
export async function uploadedSigningEnabled(client: SupabaseClient, userId?: string, state?: SigningRollout): Promise<boolean> {
  const rollout = state ?? await loadSigningRollout(client);
  if (rollout.enabled) return true;
  if (!userId) return false;
  const { data, error } = await client.from("onboarding_signing_preview_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Unable to verify signing preview access.");
  return Boolean(data);
}
/** Admin preparation does not alter the signing requirements agents currently see. */
export async function signingRowsForUser<T extends { slug: string }>(client: SupabaseClient, rows: T[], userId?: string): Promise<{ rows: T[]; enabled: boolean }> {
  const rollout = await loadSigningRollout(client);
  const enabled = await uploadedSigningEnabled(client, userId, rollout);
  if (enabled) return { rows, enabled };
  return { rows: legacySigningRows(rows, rollout), enabled };
}
export function legacySigningRows<T extends { slug: string; content_type?: string }>(rows: T[], rollout: SigningRollout): T[] {
  const saved = new Map(rollout.legacy_steps.map(row => [row.slug, row as unknown as T]));
  const result = rows.filter(row => row.content_type !== "signing_document").map(row => saved.get(row.slug) ?? row);
  for (const [slug, row] of saved) if (!result.some(item => item.slug === slug)) result.push(row);
  return result.map(row => ({ ...row, uploaded_signing: false }));
}
