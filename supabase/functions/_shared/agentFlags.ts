import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Internal admin-only designations. Never returned to agent-facing endpoints —
 * see the portal_agent_flags migration.
 */
export interface AgentFlags {
  leadAssist: boolean;
  companyFunded: boolean;
  jeremyFunded: boolean;
}

/** Payload field -> column, mirroring the admin-update-user-profile pattern. */
export const AGENT_FLAG_COLUMNS: Record<keyof AgentFlags, string> = {
  leadAssist: "lead_assist",
  companyFunded: "company_funded",
  jeremyFunded: "jeremy_funded",
};

export const EMPTY_AGENT_FLAGS: AgentFlags = {
  leadAssist: false,
  companyFunded: false,
  jeremyFunded: false,
};

interface AgentFlagsRow {
  user_id: string;
  lead_assist: boolean | null;
  company_funded: boolean | null;
  jeremy_funded: boolean | null;
}

function mapAgentFlagsRow(row: AgentFlagsRow): AgentFlags {
  return {
    leadAssist: row.lead_assist ?? false,
    companyFunded: row.company_funded ?? false,
    jeremyFunded: row.jeremy_funded ?? false,
  };
}

export async function loadAgentFlagsByUserId(
  adminClient: SupabaseClient,
): Promise<Map<string, AgentFlags>> {
  const { data, error } = await adminClient
    .from("portal_agent_flags")
    .select("user_id, lead_assist, company_funded, jeremy_funded");

  if (error) throw new Error(error.message);

  const map = new Map<string, AgentFlags>();
  for (const row of (data ?? []) as AgentFlagsRow[]) {
    map.set(row.user_id, mapAgentFlagsRow(row));
  }
  return map;
}

export async function loadAgentFlagsForUser(
  adminClient: SupabaseClient,
  userId: string,
): Promise<AgentFlags> {
  const { data, error } = await adminClient
    .from("portal_agent_flags")
    .select("user_id, lead_assist, company_funded, jeremy_funded")
    .eq("user_id", userId)
    .maybeSingle<AgentFlagsRow>();

  if (error) throw new Error(error.message);

  return data ? mapAgentFlagsRow(data) : { ...EMPTY_AGENT_FLAGS };
}
