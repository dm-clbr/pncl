import { describe, expect, it, vi } from "vitest";
import { groupQuestions, readResponseOutput, validateClassification, validateSubmission } from "../../supabase/functions/_shared/summitRules";

const q = [{ id: "q1", question: "How can I get more leads?" }, { id: "q2", question: "Where can I find more prospects?" }, { id: "q3", question: "How much do leads cost?" }];
describe("Summit grouping contract", () => {
  it("validates anonymous submission shape server-side", () => {
    const valid = { id: "5192e6fe-b32e-44a9-ad30-4c942c79f4f1", client_id: "6192e6fe-b32e-44a9-ad30-4c942c79f4f1", question: "How do I grow?" };
    expect(validateSubmission(valid)).toBe(true);
    expect(validateSubmission({ ...valid, question: "   " })).toBe(false);
    expect(validateSubmission({ ...valid, id: "bad" })).toBe(false);
  });
  it("rejects missing, duplicate, unknown and invented assignments", () => {
    expect(() => validateClassification({ assignments: [] }, q, [], true)).toThrow();
    expect(() => validateClassification({ assignments: q.map(() => ({ question_id: "q1", group_key: "new:1" })) }, q, [], true)).toThrow();
    expect(() => validateClassification({ assignments: q.map((x) => ({ question_id: x.id, group_key: "invented" })) }, q, [], false)).toThrow();
    expect(() => validateClassification({ assignments: [{ question_id: "unknown", group_key: "new:1" }] }, [q[0]], [], true)).toThrow();
  });
  it("persists model-chosen semantic groups while keeping different intents separate", async () => {
    // Contract fixture, not a substitute for the live semantic evaluation.
    const classify = vi.fn().mockResolvedValue({ assignments: [{ question_id: "q1", group_key: "new:1" }, { question_id: "q2", group_key: "new:1" }, { question_id: "q3", group_key: "new:2" }] });
    let n = 0;
    const result = await groupQuestions(q, [], classify, () => `group-${++n}`);
    expect(result).toEqual([{ question_id: "q1", group_id: "group-1" }, { question_id: "q2", group_id: "group-1" }, { question_id: "q3", group_id: "group-2" }]);
  });
  it("considers groups beyond the first 100 before making new groups", async () => {
    const groups = Array.from({ length: 205 }, (_, i) => ({ id: `g${i}`, question: `Question ${i}?` }));
    const classify = vi.fn(async (questions, candidates) => ({ assignments: questions.map((x: { id: string }) => ({ question_id: x.id, group_key: candidates.some((g: { id: string }) => g.id === "g204") ? "g204" : "unmatched" })) }));
    const result = await groupQuestions([q[0]], groups, classify);
    expect(result).toEqual([{ question_id: "q1", group_id: "g204" }]);
    expect(classify).toHaveBeenCalledTimes(3);
  });
  it("rejects refusals, incomplete responses and invalid JSON", () => {
    expect(() => readResponseOutput({ status: "incomplete" })).toThrow();
    expect(() => readResponseOutput({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] })).toThrow();
    expect(() => readResponseOutput({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "invalid" }] }] })).toThrow();
  });
});
