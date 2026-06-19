import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { generateAvailableWorkspaceEmail } from "../_shared/email.ts";
import { createWorkspaceUser } from "../_shared/googleWorkspace.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  getServiceClient,
  validateSubmitPayload,
} from "../_shared/onboarding.ts";
import { provisionPortalAccount } from "../_shared/portalAuth.ts";
import {
  encryptTemporaryPassword,
  generateHandoffToken,
  generateTemporaryPassword,
  hashHandoffToken,
} from "../_shared/security.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const requestId = crypto.randomUUID();

  try {
    logOnboarding("submit_request_received", { requestId });

    const payload = validateSubmitPayload(await req.json());
    logOnboarding("submit_payload_validated", {
      requestId,
      legalName: payload.legalName,
      stateOfResidence: payload.stateOfResidence,
      hasLicense: payload.hasLicense,
      hasEoInsurance: payload.hasEoInsurance,
      hasNpn: Boolean(payload.npn),
    });

    const supabase = getServiceClient();

    const handoffToken = generateHandoffToken();
    const handoffTokenHash = await hashHandoffToken(handoffToken);
    const handoffTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const temporaryPassword = generateTemporaryPassword();
    const temporaryPasswordEncrypted = await encryptTemporaryPassword(temporaryPassword);
    const ssnEncrypted = await encryptTemporaryPassword(payload.ssn);
    const workspaceEmail = await generateAvailableWorkspaceEmail(
      supabase,
      payload.firstName,
      payload.lastName,
    );

    logOnboarding("submit_workspace_email_generated", { requestId, workspaceEmail });

    const { data: record, error: insertError } = await supabase
      .from("onboarding_records")
      .insert({
        legal_name: payload.legalName,
        first_name: payload.firstName,
        last_name: payload.lastName,
        phone_number: payload.phoneNumber,
        date_of_birth: payload.dateOfBirth,
        ssn_encrypted: ssnEncrypted,
        state_of_residence: payload.stateOfResidence,
        upline_network: payload.uplineNetwork,
        has_license: payload.hasLicense,
        npn: payload.npn ?? null,
        has_eo_insurance: payload.hasEoInsurance,
        workspace_email: workspaceEmail,
        status: "creating_email",
        handoff_token_hash: handoffTokenHash,
        handoff_token_expires_at: handoffTokenExpiresAt,
        temporary_password_encrypted: temporaryPasswordEncrypted,
      })
      .select("id")
      .single();

    if (insertError || !record) {
      logOnboarding(
        "submit_db_insert_failed",
        { requestId, workspaceEmail, error: insertError?.message ?? "no record returned" },
        "error",
      );
      return errorResponse("Unable to create onboarding record", 500);
    }

    const onboardingId = record.id;
    logOnboarding("submit_db_record_created", { requestId, onboardingId, workspaceEmail });

    let finalStatus = "creating_email";
    let failureError: string | undefined;

    try {
      const googleUserId = await createWorkspaceUser({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: workspaceEmail,
        temporaryPassword,
        recoveryEmail: payload.personalEmail,
      });

      finalStatus = "ready";
      let supabaseUserId: string | null = null;
      let portalProvisionError: string | undefined;

      try {
        supabaseUserId = await provisionPortalAccount(supabase, {
          email: workspaceEmail,
          legalName: payload.legalName,
          firstName: payload.firstName,
          lastName: payload.lastName,
          onboardingId,
        });
      } catch (portalError) {
        portalProvisionError = portalError instanceof Error
          ? portalError.message
          : "Portal account provisioning failed";
        logOnboarding(
          "submit_portal_provision_failed",
          { requestId, onboardingId, workspaceEmail, error: portalProvisionError },
          "error",
        );
      }

      const { error: updateError } = await supabase
        .from("onboarding_records")
        .update({
          status: "ready",
          google_user_id: googleUserId,
          supabase_user_id: supabaseUserId,
        })
        .eq("id", onboardingId);

      if (updateError) {
        logOnboarding(
          "submit_db_ready_update_failed",
          { requestId, onboardingId, googleUserId, error: updateError.message },
          "error",
        );
      } else {
        logOnboarding("submit_completed", {
          requestId,
          onboardingId,
          workspaceEmail,
          googleUserId,
          supabaseUserId,
          status: finalStatus,
          portalProvisionError: portalProvisionError ?? null,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Google Workspace user creation failed";
      logOnboarding(
        "submit_google_provisioning_failed",
        { requestId, onboardingId, workspaceEmail, error: errorMessage },
        "error",
      );
      failureError = errorMessage;
      finalStatus = "failed";
      await supabase
        .from("onboarding_records")
        .update({
          status: "failed",
          google_creation_error: errorMessage,
          temporary_password_encrypted: null,
        })
        .eq("id", onboardingId);
    }

    return jsonResponse({
      onboardingId,
      handoffToken,
      status: finalStatus,
      workspaceEmail,
      ...(failureError ? { error: failureError } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    logOnboarding("submit_request_failed", { requestId, error: message }, "error");
    return errorResponse(message, 400);
  }
});
