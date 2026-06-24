import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  mapPortalW9Summary,
  type PortalW9Record,
  validateSubmitPortalW9Payload,
} from "../_shared/portalW9.ts";
import { encryptTemporaryPassword } from "../_shared/security.ts";

function getCompletedTodos(metadata: Record<string, unknown> | undefined): Record<string, boolean> {
  const value = metadata?.completed_portal_todos;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, boolean>;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const payload = validateSubmitPortalW9Payload(await req.json());
    const tinEncrypted = await encryptTemporaryPassword(payload.tin);
    const now = new Date().toISOString();

    const { data, error } = await adminClient
      .from("portal_w9_forms")
      .upsert({
        user_id: user.id,
        legal_name: payload.legalName,
        business_name: payload.businessName,
        tax_classification: payload.taxClassification,
        address_line1: payload.addressLine1,
        address_line2: payload.addressLine2,
        city: payload.city,
        state: payload.state,
        zip: payload.zip,
        tin_type: payload.tinType,
        tin_encrypted: tinEncrypted,
        signature_name: payload.signatureName,
        signed_at: now,
        has_foreign_partners: payload.hasForeignPartners ?? false,
        exempt_payee_code: payload.exemptPayeeCode ?? null,
        fatca_exemption_code: payload.fatcaExemptionCode ?? null,
        account_numbers: payload.accountNumbers ?? null,
        updated_at: now,
      }, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const completedTodos = {
      ...getCompletedTodos(user.user_metadata),
      w9_setup: true,
    };

    const { error: metadataError } = await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        completed_portal_todos: completedTodos,
      },
    });

    if (metadataError) {
      throw new Error(metadataError.message);
    }

    logOnboarding("portal_w9_submitted", { userId: user.id });

    return jsonResponse({
      w9: mapPortalW9Summary(data as PortalW9Record),
      message: "W-9 submitted successfully.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to submit W-9";
    logOnboarding("portal_w9_submit_failed", { error: message }, "error");
    return errorResponse(message, 500, "submit_failed");
  }
});
