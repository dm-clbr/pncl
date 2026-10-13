import { getSupabaseConfig } from "@/lib/supabase";

export type IntegrationState = "not_linked" | "connected" | "account_unavailable";
export interface IntegrationTarget { id: string; email: string; first_name: string; last_name: string; npn: string | null; parent_id: string | null }
export interface IntegrationSource { id: string; email: string; personal_email: string | null; first_name: string; last_name: string; npn: string | null; agent_number: number | null; comp_level: number | null; comp_effective_at: string | null; parent_id: string | null }
export interface IntegrationMatch { source: IntegrationSource; status: "linked" | "suggested" | "name_review" | "conflict" | "unmatched"; reason: string; candidates: Array<{ target: IntegrationTarget; reasons: string[] }> }
export interface IntegrationLink { pncl_user_id: string; leadspply_user_id: string; pay_tier?: number | null; pncl_parent_id?: string | null; sync_status?: string | null; synced_at?: string | null }
export interface IntegrationPreview { matches: IntegrationMatch[]; targets: IntegrationTarget[]; links: IntegrationLink[]; partners: Array<{ user_id_a: string; user_id_b: string }>; token: string; revision: number; recentRuns: Array<{ id: string; created_at: string; revision: number; linked_count: number; synced_count: number; unresolved_count: number; pncl_actor_id: string | null; actor_id: string | null }>; events: Array<{ id: string; created_at: string; kind: string; pncl_user_id: string | null; leadspply_user_id: string | null; pncl_actor_id: string | null }> }
export interface OwnIntegrationStatus { state: IntegrationState; account: null | { name: string; email: string; sync_status: string; synced_at: string | null; pay_tier: number | null; linked_at: string | null } }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export async function manageLeadSpplyIntegration<T>(accessToken: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/manage-leadspply-integration`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, apikey: anonKey },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(data) && typeof data.message === "string" ? data.message : "Unable to update the LeadSpply connection.";
    const error = new Error(message) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = isRecord(data) && typeof data.error === "string" ? data.error : undefined;
    throw error;
  }
  if (body.action === "preview" && isRecord(data) && data.partners === null) {
    return { ...data, partners: [] } as T;
  }
  return data as T;
}

export const integrationName = (person: Pick<IntegrationTarget, "first_name" | "last_name" | "email">) =>
  `${person.first_name} ${person.last_name}`.trim() || person.email;

export function integrationStatusLabel(value: string | null | undefined): string {
  if (value === "synced") return "Linked";
  if (value === "upline_unlinked") return "Linked · upline needs review";
  return "Account sync pending";
}
