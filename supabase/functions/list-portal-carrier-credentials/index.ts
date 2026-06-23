import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  mapCarrierRecord,
  type PortalCarrierRecord,
} from "../_shared/portalCarriers.ts";
import {
  type PortalCarrierCredentialRecord,
  type CarrierCredentialItem,
} from "../_shared/portalCarrierCredentials.ts";
import { decryptTemporaryPassword } from "../_shared/security.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);

    const { data: carrierRows, error: carrierError } = await adminClient
      .from("portal_carriers")
      .select("*")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (carrierError) {
      throw new Error(carrierError.message);
    }

    const { data: credentialRows, error: credentialError } = await adminClient
      .from("portal_carrier_credentials")
      .select("*")
      .eq("user_id", user.id);

    if (credentialError) {
      throw new Error(credentialError.message);
    }

    const credentialsByCarrierId = new Map<string, PortalCarrierCredentialRecord>();
    for (const row of (credentialRows ?? []) as PortalCarrierCredentialRecord[]) {
      credentialsByCarrierId.set(row.carrier_id, row);
    }

    const items: CarrierCredentialItem[] = await Promise.all(
      ((carrierRows ?? []) as PortalCarrierRecord[]).map(async (row) => {
        const carrier = mapCarrierRecord(row);
        const credential = credentialsByCarrierId.get(carrier.id);
        let password: string | null = null;

        if (credential?.password_encrypted) {
          password = await decryptTemporaryPassword(credential.password_encrypted);
        }

        return {
          carrierId: carrier.id,
          carrier: carrier.carrier,
          loginUrl: carrier.eAppUrl,
          username: credential?.username?.trim() ? credential.username.trim() : null,
          password,
        };
      }),
    );

    return jsonResponse({ credentials: items });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to list carrier credentials";
    logOnboarding("list_portal_carrier_credentials_failed", { error: message }, "error");
    return errorResponse(message, 500, "list_failed");
  }
});
