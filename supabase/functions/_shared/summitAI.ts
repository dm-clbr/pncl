import { readResponseOutput, SUMMIT_INSTRUCTIONS, validateClassification, type Question } from "./summitRules.ts";

export async function classifySummitQuestions(options: {
  apiKey: string; model: string; questions: Question[]; groups: Question[]; allowNew: boolean; timeoutMs: number;
}) {
  const { apiKey, model, questions, groups, allowNew, timeoutMs } = options;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model, store: false, max_output_tokens: 2000,
      instructions: `${SUMMIT_INSTRUCTIONS}\nReturn one integer group index per question, in exactly the same order as the questions array. Existing groups use their supplied nonnegative index. ${allowNew
        ? 'For unmatched questions, create new clusters using negative integers -1, -2, etc. Questions with the same meaning must share the same index.'
        : 'If no existing group matches, use -1. Do not create new groups in this step.'}`,
      // Compact indices avoid emitting thousands of UUID tokens per batch.
      input: JSON.stringify({ questions: questions.map((q,index) => ({index,question:q.question})), existing_groups: groups.map((g,index) => ({ index, question: g.question })) }),
      text: { format: { type: "json_schema", name: "summit_groups", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["groups"],
        properties: { groups: { type: "array", minItems: questions.length, maxItems: questions.length, items: { type: "integer", enum: [...groups.map((_,i)=>i),...(allowNew ? questions.map((_,i)=>-i-1) : [-1])] } } },
      } } },
    }),
  });
  // Never log prompts, original questions, response bodies or API secrets.
  if (!response.ok) throw new Error(`ai_http_${response.status}`);
  const output = readResponseOutput(await response.json()) as { groups?: unknown[] };
  if (!Array.isArray(output?.groups) || output.groups.length !== questions.length) throw new Error("incomplete_ai_output");
  const assignments = output.groups.map((index, i) => {
    if (typeof index !== "number" || !Number.isInteger(index) || index >= groups.length || (!allowNew && index < -1)) throw new Error("invalid_ai_output");
    return { question_id: questions[i].id, group_key: index >= 0 ? groups[index].id : allowNew ? `new:${-index}` : "unmatched" };
  });
  return validateClassification({ assignments }, questions, groups, allowNew);
}
