import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { validateSubmission } from "../_shared/summitRules.ts";
import { processSummitQuestions } from "../_shared/summitWorker.ts";

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return errorResponse("Use POST to submit a question.", 405);
  try {
    // Bound the input before parsing, even if Content-Length was omitted.
    const reader = req.body?.getReader();
    if (!reader) return errorResponse("Please enter a question.", 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) { await reader.cancel(); return errorResponse("Please keep your question to 1,000 characters or fewer.", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return errorResponse("Invalid submission. Please try again.", 400); }
    if (!validateSubmission(body)) return errorResponse("Please enter a question between 5 and 1,000 characters.", 400);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("summit_accept", { p_id: body.id, p_client_id: body.client_id, p_question: body.question });
    if (error) {
      if (error.message.includes("rate_limited")) return errorResponse("You’ve sent several questions. Please wait a minute before sending another.", 429);
      if (error.message.includes("submission_conflict")) return errorResponse("This submission changed. Please refresh and try again.", 409);
      console.error("Summit submission failed", error.code);
      return errorResponse("Your question couldn’t be saved. Please try again.", 503);
    }
    if (data.wake) EdgeRuntime.waitUntil(processSummitQuestions(db));
    // Acknowledged only after the durable database transaction commits.
    return jsonResponse({ id: data.id }, 201);
  } catch {
    return errorResponse("Your question couldn’t be saved. Please try again.", 503);
  }
});
