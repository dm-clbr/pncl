import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { changeHubWorkEmail, HubEmailError, parseHubEmailChange } from "../_shared/hubEmailChange.ts";

serve(async req => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  try {
    const { adminClient } = await requireAdmin(req);
    const body = await req.json().catch(() => null);
    const payload = parseHubEmailChange(body);
    // The RPC sees the verified caller's JWT and checks the current database
    // admin role again. It never accepts an admin ID or user_metadata as proof.
    const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return jsonResponse(await changeHubWorkEmail(caller, adminClient, payload));
  } catch (error) {
    if (error instanceof AdminAuthError || error instanceof HubEmailError) return errorResponse(error.message, error.status, error.code);
    console.error('admin_work_email_change_failed', { kind: error instanceof Error ? error.name : 'Unknown' });
    return errorResponse('Email update could not be confirmed. Refresh the account before retrying.', 502, 'update_failed');
  }
});
