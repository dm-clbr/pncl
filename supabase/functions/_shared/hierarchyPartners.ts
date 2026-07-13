import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface PartnerLinkRow {
  id: string;
  user_id_a: string;
  user_id_b: string;
  created_at: string;
  created_by_admin_id: string | null;
}

export function canonicalPartnerPair(userIdA: string, userIdB: string): [string, string] {
  return userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}

export function getPartnerGroupId(userIdA: string, userIdB: string): string {
  const [a, b] = canonicalPartnerPair(userIdA, userIdB);
  return `partner:${a}:${b}`;
}

export function isPartnerGroupId(id: string): boolean {
  return id.startsWith("partner:");
}

export function parsePartnerGroupId(id: string): [string, string] | null {
  if (!isPartnerGroupId(id)) return null;
  const parts = id.slice("partner:".length).split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

export async function loadHierarchyPartnerLinks(
  adminClient: SupabaseClient,
): Promise<PartnerLinkRow[]> {
  const { data, error } = await adminClient
    .from("hierarchy_partner_links")
    .select("id, user_id_a, user_id_b, created_at, created_by_admin_id");

  if (error) throw error;
  return (data ?? []) as PartnerLinkRow[];
}

export function buildPartnerLookup(links: PartnerLinkRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const link of links) {
    map.set(link.user_id_a, link.user_id_b);
    map.set(link.user_id_b, link.user_id_a);
  }
  return map;
}

export async function findPartnerLinkForUser(
  adminClient: SupabaseClient,
  userId: string,
): Promise<PartnerLinkRow | null> {
  const { data, error } = await adminClient
    .from("hierarchy_partner_links")
    .select("id, user_id_a, user_id_b, created_at, created_by_admin_id")
    .or(`user_id_a.eq.${userId},user_id_b.eq.${userId}`)
    .maybeSingle();

  if (error) throw error;
  return (data as PartnerLinkRow | null) ?? null;
}
