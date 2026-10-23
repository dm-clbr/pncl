import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { defaultFlowRules, type FlowRules } from "./onboardingEditorRules.ts";
export async function loadFlowRules(
  client: SupabaseClient,
  designation: string,
): Promise<{ rules: FlowRules; revision: number }> {
  const { data, error } = await client
    .from("onboarding_flow_rules")
    .select("rules,revision")
    .eq("designation", designation)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? { rules: defaultFlowRules(), revision: 0 };
}
