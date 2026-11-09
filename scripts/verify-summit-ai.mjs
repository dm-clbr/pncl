// Run with Node 22.6+ / 24 and an authorized OPENAI_API_KEY in the environment.
// Uses only synthetic questions; creates no database records and prints no key.
import assert from "node:assert/strict";
import { groupQuestions } from "../supabase/functions/_shared/summitRules.ts";
import { classifySummitQuestions } from "../supabase/functions/_shared/summitAI.ts";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY must be configured securely before this live check.");
const model = process.env.SUMMIT_OPENAI_MODEL || "gpt-4.1-mini";
const metrics=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(...args)=>{
  const started=performance.now();const response=await originalFetch(...args);
  const payload=await response.clone().json();
  metrics.push({milliseconds:Math.round(performance.now()-started),inputTokens:payload.usage?.input_tokens,outputTokens:payload.usage?.output_tokens,requestsPerMinute:response.headers.get("x-ratelimit-limit-requests"),tokensPerMinute:response.headers.get("x-ratelimit-limit-tokens")});
  return response;
};
const questions = [
  { id: "q1", question: "How can I get more leads?" },
  { id: "q2", question: "Where can I find more prospects to contact?" },
  { id: "q3", question: "What are the best ways to find new potential clients?" },
  { id: "q4", question: "How much does each lead cost?" },
  { id: "q5", question: "What is the price per lead?" },
  { id: "q6", question: "When do commission payments arrive?" },
  { id: "q7", question: "What days are commissions paid out?" },
  { id: "q8", question: "Which training sessions should a brand-new agent attend first?" },
  { id: "q9", question: "Which carriers currently offer final expense coverage?" },
];
const classify = (questions, groups, allowNew) => classifySummitQuestions({ apiKey, model, questions, groups, allowNew, timeoutMs: 40000 });
const assignments = await groupQuestions(questions, [], classify);
const byId = Object.fromEntries(assignments.map((x) => [x.question_id, x.group_id]));
assert.equal(byId.q1, byId.q2); assert.equal(byId.q1, byId.q3);
assert.equal(byId.q4, byId.q5); assert.equal(byId.q6, byId.q7);
assert.equal(new Set([byId.q1, byId.q4, byId.q6, byId.q8, byId.q9]).size, 5);
const groups = [...new Set(assignments.map((x) => x.group_id))].map((id) => ({ id, question: questions.find((q) => byId[q.id] === id).question }));
const later = await groupQuestions([{ id: "later", question: "How do I source additional people who might buy insurance?" }], groups, classify);
assert.equal(later[0].group_id, byId.q1);
let batchCheck;
if(process.env.SUMMIT_EVAL_BATCH === "100") {
  const batch=Array.from({length:100},(_,i)=>({id:`batch-${i}`,question:questions[i%questions.length].question}));
  const result=await groupQuestions(batch,groups,classify);
  for(const assignment of result){const i=Number(assignment.question_id.split("-")[1]);assert.equal(assignment.group_id,byId[questions[i%questions.length].id]);}
  batchCheck={questions:100,allMatchedExpectedGroups:true,milliseconds:metrics.at(-1).milliseconds};
}
console.log(JSON.stringify({ passed: true, model, originalQuestions: 9, groups: 5, counts: [3, 2, 2, 1, 1], laterParaphraseMatchedExistingGroup: true,batchCheck,metrics }));
