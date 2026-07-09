import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  DIRECT_DEPOSIT_PDF_BUCKET,
  DIRECT_DEPOSIT_TODO_SLUG,
  generateDirectDepositPdf,
  getDirectDepositPdfPath,
  mapDirectDepositSummary,
  type DirectDepositRecord,
  validateSubmitDirectDepositPayload,
} from "../_shared/portalDirectDeposit.ts";
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
    const payload = validateSubmitDirectDepositPayload(await req.json());
    const signedAt = new Date();
    const now = signedAt.toISOString();
    const pdfPath = getDirectDepositPdfPath(user.id);

    const accountNumberEncrypted = await encryptTemporaryPassword(payload.accountNumber);
    const routingNumberEncrypted = await encryptTemporaryPassword(payload.routingNumber);
    const pdfBytes = await generateDirectDepositPdf(payload, signedAt);

    const { error: uploadError } = await adminClient.storage
      .from(DIRECT_DEPOSIT_PDF_BUCKET)
      .upload(pdfPath, pdfBytes, {
        upsert: true,
        contentType: "application/pdf",
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data, error } = await adminClient
      .from("portal_direct_deposit_forms")
      .upsert({
        user_id: user.id,
        legal_name: payload.legalName,
        address_line1: payload.addressLine1,
        city: payload.city,
        state: payload.state,
        zip: payload.zip,
        account_type: payload.accountType,
        account_number_encrypted: accountNumberEncrypted,
        routing_number_encrypted: routingNumberEncrypted,
        signature_name: payload.signatureName,
        signed_at: now,
        pdf_path: pdfPath,
        updated_at: now,
      }, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const completedTodos = {
      ...getCompletedTodos(user.user_metadata),
      [DIRECT_DEPOSIT_TODO_SLUG]: true,
    };

    const { error: metadataError } = await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        completed_portal_todos: completedTodos,
        // Clear the re-submit notice shown after an admin reset.
        direct_deposit_resign_required: false,
      },
    });

    if (metadataError) {
      throw new Error(metadataError.message);
    }

    logOnboarding("portal_direct_deposit_submitted", { userId: user.id });

    return jsonResponse({
      directDeposit: mapDirectDepositSummary(data as DirectDepositRecord),
      message: "Direct deposit form submitted successfully.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to submit direct deposit form";
    logOnboarding("portal_direct_deposit_submit_failed", { error: message }, "error");
    return errorResponse(message, 500, "submit_failed");
  }
});
