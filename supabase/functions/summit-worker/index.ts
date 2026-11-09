import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { UUID } from "../_shared/summitRules.ts";
import { processSummitQuestions } from "../_shared/summitWorker.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null,{status:405});
  const token = req.headers.get("x-summit-wake");
  if (!token || !UUID.test(token)) return new Response(null,{status:401});
  const db = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const { data, error } = await db.rpc("summit_consume_wake",{p_token:token});
  if (error || data !== true) return new Response(null,{status:401});
  EdgeRuntime.waitUntil(processSummitQuestions(db));
  return new Response(null,{status:202});
});
