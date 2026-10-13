import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveAgentDesignation, type AgentDesignation } from "./agentDesignation.ts";

export async function loadAgentDesignations(
  adminClient: SupabaseClient,
  userIds: string[],
): Promise<Map<string, AgentDesignation>> {
  if (!userIds.length) return new Map();
  const { data, error } = await adminClient
    .from("portal_agent_designations")
    .select("user_id, designation")
    .in("user_id", userIds);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.user_id, resolveAgentDesignation(row.designation)]));
}

/** Apply the invite once; retries preserve later admin corrections. */
export async function initializePortalAgentDesignation(
  supabase: SupabaseClient,
  userId: string,
  invitedDesignation: unknown,
): Promise<void> {
  const { error } = await supabase.from("portal_agent_designations").upsert({
    user_id: userId,
    designation: resolveAgentDesignation(invitedDesignation),
  }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw new Error("Unable to assign the invited onboarding designation");
}
