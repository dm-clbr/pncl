import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { listPortalUsers } from "./adminAgents.ts";

export interface LeadChargeUploadRow {
  email?: string;
  name?: string;
  agentNumber?: number;
  description?: string;
  amountCents: number;
}

export interface LeadChargeRecord {
  id: string;
  week_of: string;
  user_id: string | null;
  agent_email: string | null;
  agent_name: string | null;
  description: string | null;
  amount_cents: number;
  source_file: string | null;
  created_at: string;
}

interface UserMatcher {
  byEmail: Map<string, string>;
  byAgentNumber: Map<number, string>;
}

/**
 * Builds lookup maps to attribute charge rows to portal users: portal email,
 * onboarding personal email, and the auto-assigned agent number.
 */
export async function buildLeadChargeUserMatcher(
  adminClient: SupabaseClient,
): Promise<UserMatcher> {
  const byEmail = new Map<string, string>();
  const byAgentNumber = new Map<number, string>();

  const users = await listPortalUsers(adminClient);
  for (const user of users) {
    if (user.email) byEmail.set(user.email.trim().toLowerCase(), user.id);
  }

  const { data: onboardingRows } = await adminClient
    .from("onboarding_records")
    .select("supabase_user_id, personal_email")
    .not("supabase_user_id", "is", null);

  for (const row of (onboardingRows ?? []) as { supabase_user_id: string; personal_email: string | null }[]) {
    const email = row.personal_email?.trim().toLowerCase();
    if (email && !byEmail.has(email)) {
      byEmail.set(email, row.supabase_user_id);
    }
  }

  const { data: profileRows } = await adminClient
    .from("portal_profiles")
    .select("user_id, agent_number")
    .not("agent_number", "is", null);

  for (const row of (profileRows ?? []) as { user_id: string; agent_number: number }[]) {
    byAgentNumber.set(row.agent_number, row.user_id);
  }

  return { byEmail, byAgentNumber };
}

export function matchLeadChargeRow(
  row: LeadChargeUploadRow,
  matcher: UserMatcher,
): string | null {
  if (row.email) {
    const userId = matcher.byEmail.get(row.email.trim().toLowerCase());
    if (userId) return userId;
  }
  if (row.agentNumber !== undefined) {
    const userId = matcher.byAgentNumber.get(row.agentNumber);
    if (userId) return userId;
  }
  return null;
}

export function validateWeekOf(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new Error("weekOf must be a date in YYYY-MM-DD format");
  }
  return value.trim();
}
