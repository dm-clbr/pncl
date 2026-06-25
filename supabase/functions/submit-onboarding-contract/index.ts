import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { getServiceClient } from "../_shared/onboarding.ts";
import {
  generateSignedIcaPdf,
  getOnboardingContractPdfPath,
  ICA_VERSION,
  mapOnboardingContractSummary,
  ONBOARDING_CONTRACT_BUCKET,
  type OnboardingContractRecord,
  validateSubmitOnboardingContractPayload,
} from "../_shared/onboardingContract.ts";

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
    const payload = validateSubmitOnboardingContractPayload(await req.json());
    const signedAt = new Date();
    const signatureId = crypto.randomUUID();
    const pdfPath = getOnboardingContractPdfPath(signatureId);
    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    const pdfBytes = await generateSignedIcaPdf(payload, signedAt, {
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    }, import.meta.url);

    const supabase = getServiceClient();

    const { error: uploadError } = await supabase.storage
      .from(ONBOARDING_CONTRACT_BUCKET)
      .upload(pdfPath, pdfBytes, {
        upsert: true,
        contentType: "application/pdf",
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data, error } = await supabase
      .from("onboarding_contract_signatures")
      .insert({
        id: signatureId,
        legal_name: payload.legalName,
        personal_email: payload.personalEmail,
        signature_name: payload.signatureName,
        ica_version: ICA_VERSION,
        debit_check_initials: payload.debitCheckInitials,
        agreement_accepted: payload.agreementAccepted,
        counsel_acknowledged: payload.counselAcknowledged,
        signed_at: signedAt.toISOString(),
        pdf_path: pdfPath,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to save contract signature");
    }

    logOnboarding("onboarding_contract_signed", {
      contractSignatureId: signatureId,
      legalName: payload.legalName,
    });

    return jsonResponse({
      contractSignatureId: signatureId,
      contract: mapOnboardingContractSummary(data as OnboardingContractRecord),
      message: "Independent Contractor Agreement signed successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign contract";
    logOnboarding("onboarding_contract_sign_failed", { error: message }, "error");
    return errorResponse(message, 400);
  }
});
