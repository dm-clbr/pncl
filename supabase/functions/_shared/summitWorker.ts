import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { groupQuestions, type Question } from "./summitRules.ts";
import { classifySummitQuestions } from "./summitAI.ts";

export async function processSummitQuestions(db: SupabaseClient): Promise<void> {
  const startedAt = Date.now();
  // Bounded execution. Both new submissions and presenter polling wake the
  // durable queue, including after runtime termination or provider downtime.
  while (Date.now() - startedAt < 70_000) {
    const token = crypto.randomUUID();
    const { data: claim, error } = await db.rpc("summit_claim", { p_token: token });
    if (error) { console.error("Summit queue claim failed", error.code); return; }
    if (!claim) return;
    try {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) throw new Error("ai_not_configured");
      const batch = claim as { questions: Question[]; groups: Question[] };
      const deadline = Math.min(Date.now() + 100_000, startedAt + 110_000);
      const assignments = await groupQuestions(batch.questions, batch.groups, async (questions, groups, allowNew) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("ai_timeout");
        return classifySummitQuestions({ apiKey, model: Deno.env.get("SUMMIT_OPENAI_MODEL") || "gpt-4.1-mini", questions, groups, allowNew, timeoutMs: Math.min(40_000, remaining) });
      });
      const { error: finishError } = await db.rpc("summit_finish", { p_token: token, p_assignments: assignments });
      if (finishError) throw new Error("group_commit_failed");
    } catch (error) {
      const code = error instanceof Error && /^(ai_[a-z0-9_]+|invalid_ai_output|incomplete_ai_output|group_commit_failed)$/.test(error.message) ? error.message : "ai_unavailable";
      await db.rpc("summit_fail", { p_token: token, p_error: code });
      console.error("Summit grouping deferred", code);
      return;
    }
  }
}
