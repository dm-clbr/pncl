import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  generateSignedIcaPdf,
  ICA_VERSION,
  validateSubmitOnboardingContractPayload,
} from "../_shared/onboardingContract.ts";
import {
  getPortalIcaPdfPath,
  ICA_TODO_SLUG,
  mapPortalIcaSummary,
  PORTAL_ICA_PDF_BUCKET,
  type PortalIcaRecord,
} from "../_shared/portalIca.ts";
import { notifyAdminsOfIcaSigned } from "../_shared/contractingNotifications.ts";

function getCompletedTodos(metadata: Record<string, unknown> | undefined): Record<string, boolean> {
  const value = metadata?.completed_portal_todos;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, boolean>;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.headers.get("x-real-ip");
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const payload = validateSubmitOnboardingContractPayload(await req.json());
    const signedAt = new Date();
    const now = signedAt.toISOString();
    const pdfPath = getPortalIcaPdfPath(user.id);
    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    const pdfBytes = await generateSignedIcaPdf(payload, signedAt, {
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    }, import.meta.url);

    const { error: uploadError } = await adminClient.storage
      .from(PORTAL_ICA_PDF_BUCKET)
      .upload(pdfPath, pdfBytes, {
        upsert: true,
        contentType: "application/pdf",
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data, error } = await adminClient
      .from("portal_ica_signatures")
      .upsert({
        user_id: user.id,
        legal_name: payload.legalName,
        personal_email: payload.personalEmail,
        signature_name: payload.signatureName,
        ica_version: ICA_VERSION,
        debit_check_initials: payload.debitCheckInitials,
        agreement_accepted: payload.agreementAccepted,
        counsel_acknowledged: payload.counselAcknowledged,
        signed_at: now,
        pdf_path: pdfPath,
        ip_address: ipAddress,
        user_agent: userAgent,
        updated_at: now,
      }, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to save ICA signature");
    }

    const completedTodos = {
      ...getCompletedTodos(user.user_metadata),
      [ICA_TODO_SLUG]: true,
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

    logOnboarding("portal_ica_submitted", { userId: user.id });

    try {
      await notifyAdminsOfIcaSigned(adminClient, {
        userId: user.id,
        agentName: payload.legalName,
        agentEmail: user.email ?? "",
        signedAt: now,
      });
    } catch (notifyError) {
      const message = notifyError instanceof Error
        ? notifyError.message
        : "ICA admin notification failed";
      logOnboarding("portal_ica_notification_failed", { userId: user.id, error: message }, "error");
    }

    return jsonResponse({
      ica: mapPortalIcaSummary(data as PortalIcaRecord),
      message: "Independent Contractor Agreement signed successfully.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to sign agreement";
    logOnboarding("portal_ica_submit_failed", { error: message }, "error");
    return errorResponse(message, 400, "submit_failed");
  }
});
