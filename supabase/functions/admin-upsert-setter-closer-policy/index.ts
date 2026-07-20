import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  buildNpnUserMatcher,
  buildSetterCloserPolicyInsertPayload,
  mapSetterCloserPolicyRecord,
  type SetterCloserPolicyRecord,
  validateUpsertSetterCloserPolicyPayload,
} from "../_shared/setterCloserPolicies.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const body = await req.json();
    const input = validateUpsertSetterCloserPolicyPayload(body);
    const payload = await buildSetterCloserPolicyInsertPayload(adminClient, input, adminUser.id);

    const query = input.id
      ? adminClient
        .from("setter_closer_policies")
        .update(payload)
        .eq("id", input.id)
        .select("*")
        .single()
      : adminClient
        .from("setter_closer_policies")
        .insert(payload)
        .select("*")
        .single();

    const { data, error } = await query;
    if (error || !data) {
      throw new Error(error?.message ?? "Unable to save policy");
    }

    const matcher = await buildNpnUserMatcher(adminClient);
    const policy = mapSetterCloserPolicyRecord(data as SetterCloserPolicyRecord, matcher);

    logOnboarding("admin_setter_closer_policy_saved", {
      policyId: policy.id,
      splitType: policy.splitType,
      closerNpn: policy.closerNpn,
    });

    return jsonResponse({ message: "Policy saved.", policy });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to save policy";
    logOnboarding("admin_upsert_setter_closer_policy_failed", { error: message }, "error");
    return errorResponse(message, 400, "save_failed");
  }
});
