import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  mapCredentialRecord,
  validateUpsertCarrierCredentialPayload,
  type PortalCarrierCredentialRecord,
} from "../_shared/portalCarrierCredentials.ts";
import {
  decryptTemporaryPassword,
  encryptTemporaryPassword,
} from "../_shared/security.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const body = await req.json();
    const payload = validateUpsertCarrierCredentialPayload(body);

    const { data: carrier, error: carrierError } = await adminClient
      .from("portal_carriers")
      .select("id")
      .eq("id", payload.carrierId)
      .eq("published", true)
      .maybeSingle();

    if (carrierError) {
      throw new Error(carrierError.message);
    }

    if (!carrier) {
      return errorResponse("Carrier not found", 404, "not_found");
    }

    const { data: existing, error: existingError } = await adminClient
      .from("portal_carrier_credentials")
      .select("*")
      .eq("user_id", user.id)
      .eq("carrier_id", payload.carrierId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingRecord = existing as PortalCarrierCredentialRecord | null;
    const trimmedPassword = payload.password?.trim() ?? "";

    let passwordEncrypted = existingRecord?.password_encrypted ?? null;
    if (trimmedPassword) {
      passwordEncrypted = await encryptTemporaryPassword(trimmedPassword);
    } else if (!existingRecord) {
      return errorResponse("Password is required", 400, "password_required");
    }

    const upsertPayload = {
      user_id: user.id,
      carrier_id: payload.carrierId,
      username: payload.username,
      password_encrypted: passwordEncrypted,
      writing_number: payload.writingNumber ?? existingRecord?.writing_number ?? "",
    };

    const { data, error } = await adminClient
      .from("portal_carrier_credentials")
      .upsert(upsertPayload, { onConflict: "user_id,carrier_id" })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const saved = data as PortalCarrierCredentialRecord;
    const password = saved.password_encrypted
      ? await decryptTemporaryPassword(saved.password_encrypted)
      : null;

    logOnboarding("upsert_portal_carrier_credential_succeeded", {
      userId: user.id,
      carrierId: payload.carrierId,
    });

    return jsonResponse({
      message: "Carrier credentials saved.",
      credential: {
        ...mapCredentialRecord(saved),
        username: saved.username,
        password,
      },
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to save carrier credentials";
    logOnboarding("upsert_portal_carrier_credential_failed", { error: message }, "error");
    return errorResponse(message, 500, "save_failed");
  }
});
