import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getServiceClient } from "../_shared/onboarding.ts";
import { processCapacityQueue } from "../_shared/googleCapacityWorker.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const token = req.headers.get("x-onboarding-capacity-wake");
  if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return new Response(null, { status: 401 });
  const db = getServiceClient();
  const { data, error } = await db.rpc("onboarding_capacity_claim_wake", { p_token: token });
  if (error || data !== true) return new Response(null, { status: 401 });
  EdgeRuntime.waitUntil(processCapacityQueue(db, token));
  return new Response(null, { status: 202 });
});
