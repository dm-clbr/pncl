import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { generateAvailableWorkspaceEmail } from "../_shared/email.ts";
import {
  addUserToGroups,
  createWorkspaceUser,
  getGroupsForRole,
} from "../_shared/googleWorkspace.ts";
import {
  getServiceClient,
  validateSubmitPayload,
} from "../_shared/onboarding.ts";
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

  try {
    const payload = validateSubmitPayload(await req.json());
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
      console.error("Failed to create onboarding record", insertError);
      return errorResponse("Unable to create onboarding record", 500);
    }

    let finalStatus = "creating_email";

    try {
      const googleUserId = await createWorkspaceUser({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: workspaceEmail,
        temporaryPassword,
      });

      await supabase
        .from("onboarding_records")
        .update({
          status: "email_created",
          google_user_id: googleUserId,
        })
        .eq("id", record.id);

      const groupError = await addUserToGroups(
        workspaceEmail,
        getGroupsForRole("Agent"),
      );

      finalStatus = "ready";
      await supabase
        .from("onboarding_records")
        .update({
          status: "ready",
          group_assignment_error: groupError,
        })
        .eq("id", record.id);
    } catch (error) {
      console.error("Google Workspace provisioning failed", error);
      finalStatus = "failed";
      await supabase
        .from("onboarding_records")
        .update({
          status: "failed",
          google_creation_error: "Google Workspace user creation failed",
          temporary_password_encrypted: null,
        })
        .eq("id", record.id);
    }

    return jsonResponse({
      onboardingId: record.id,
      handoffToken,
      status: finalStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return errorResponse(message, 400);
  }
});
