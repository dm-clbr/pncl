import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { generateAvailableWorkspaceEmail } from "../_shared/email.ts";
import { notifySuspendedGmailForOnboarding } from "../_shared/gmailVerificationNotifications.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  isContractSignatureExpired,
  ONBOARDING_CONTRACT_BUCKET,
  type OnboardingContractRecord,
} from "../_shared/onboardingContract.ts";
import {
  decodeImageBytes,
  getEmailDomain,
  getServiceClient,
  type SubmitOnboardingPayload,
  validateSubmitPayload,
} from "../_shared/onboarding.ts";
import { notifyGenesisAdminsOfNewOnboarding } from "../_shared/genesisNotifications.ts";
import { notifyGoogleWorkspaceAdminOfFirstSignIn } from "../_shared/googleFirstSignInNotifications.ts";
import { provisionEnrollment } from "../_shared/enrollmentProvisioning.ts";
import {
  attachOnboardingToReferralInvite,
  claimReferralInvite,
  findActiveOnboardingByPhoneNumber,
  findActiveOnboardingBySsnHash,
  releaseReferralInvite,
  resolveReferralInviteForOnboarding,
} from "../_shared/portalReferralInvites.ts";
import {
  encryptTemporaryPassword,
  generateHandoffToken,
  generateTemporaryPassword,
  hashHandoffToken,
  hashSsn,
} from "../_shared/security.ts";

async function persistApplicationAssets(
  supabase: ReturnType<typeof getServiceClient>,
  onboardingId: string,
  payload: SubmitOnboardingPayload,
  requestId: string,
): Promise<void> {
  const driversLicensePath =
    `licenses/${onboardingId}/drivers-license.${payload.driversLicenseImage.extension}`;
  const { error: licenseUploadError } = await supabase.storage
    .from(ONBOARDING_CONTRACT_BUCKET)
    .upload(driversLicensePath, decodeImageBytes(payload.driversLicenseImage), {
      upsert: true,
      contentType: payload.driversLicenseImage.contentType,
    });

  if (licenseUploadError) {
    const { data: identity } = await supabase
      .from("onboarding_records")
      .select("google_user_id, supabase_user_id")
      .eq("id", onboardingId)
      .maybeSingle();
    await supabase.from("onboarding_records").update({
      status: "failed",
      enrollment_status: "needs_attention",
      application_status: "failed",
      failed_step: "application",
      failure_code: "application_document_save_failed",
      failure_detail: licenseUploadError.message.slice(0, 1000),
      released_at: identity?.google_user_id || identity?.supabase_user_id
        ? null
        : new Date().toISOString(),
    }).eq("id", onboardingId);
    logOnboarding("submit_drivers_license_upload_failed", {
      requestId,
      onboardingId,
      error: licenseUploadError.message,
    }, "error");
    throw new Error("Unable to save your application document. Please try submitting again.");
  }

  const { error: savedError } = await supabase.from("onboarding_records").update({
    drivers_license_path: driversLicensePath,
    application_status: "saved",
    enrollment_status: "application_saved",
    application_saved_at: new Date().toISOString(),
    failed_step: null,
    failure_code: null,
    failure_detail: null,
  }).eq("id", onboardingId);
  if (savedError) throw new Error(savedError.message);
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const requestId = crypto.randomUUID();
  let claimedInviteId: string | null = null;
  let createdOnboardingId: string | null = null;

  try {
    logOnboarding("submit_request_received", { requestId });

    const payload = validateSubmitPayload(await req.json());
    logOnboarding("submit_payload_validated", {
      requestId,
      legalName: payload.legalName,
      stateOfResidence: payload.stateOfResidence,
      hasLicense: payload.hasLicense,
      hasEoInsurance: payload.hasEoInsurance,
      hasOtherImo: payload.hasOtherImo,
      hasNpn: Boolean(payload.npn),
      hasReferralInvite: Boolean(payload.referralInviteId),
    });

    const supabase = getServiceClient();

    const { data: contractRow, error: contractError } = await supabase
      .from("onboarding_contract_signatures")
      .select("*")
      .eq("id", payload.contractSignatureId)
      .maybeSingle();

    if (contractError) {
      throw new Error(contractError.message);
    }

    const contract = contractRow as OnboardingContractRecord | null;
    if (!contract) {
      return errorResponse(
        "Your signed contract was not found. Please sign the agreement again.",
        400,
        "invalid_contract",
      );
    }

    const ssnHash = await hashSsn(payload.ssn);

    if (contract.onboarding_id) {
      const { data: existing, error: existingError } = await supabase
        .from("onboarding_records")
        .select("id, ssn_hash, workspace_email")
        .eq("id", contract.onboarding_id)
        .maybeSingle();
      if (existingError || !existing || existing.ssn_hash !== ssnHash) {
        return errorResponse(
          "This signed contract is already linked to another enrollment. Contact PNCL support.",
          409,
          "contract_already_used",
        );
      }

      const resumedToken = generateHandoffToken();
      const { error: tokenError } = await supabase
        .from("onboarding_records")
        .update({
          handoff_token_hash: await hashHandoffToken(resumedToken),
          handoff_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          has_other_imo: payload.hasOtherImo,
        })
        .eq("id", existing.id);
      if (tokenError) throw new Error(tokenError.message);

      await persistApplicationAssets(supabase, existing.id, payload, requestId);
      const resumed = await provisionEnrollment(supabase, existing.id, { requestId });
      return jsonResponse({
        onboardingId: existing.id,
        handoffToken: resumedToken,
        status: resumed.status,
        enrollmentStatus: resumed.enrollmentStatus,
        workspaceEmail: existing.workspace_email,
        ...(resumed.userMessage ? { error: resumed.userMessage } : {}),
        ...(resumed.failedStep ? { failedStep: resumed.failedStep } : {}),
      });
    }

    if (isContractSignatureExpired(contract.signed_at)) {
      return errorResponse(
        "Your signed contract has expired. Please sign the agreement again.",
        400,
        "contract_expired",
      );
    }

    if (contract.legal_name.localeCompare(payload.legalName, undefined, { sensitivity: "accent" }) !== 0) {
      return errorResponse(
        "Your legal name must match the name on your signed contract.",
        400,
        "contract_name_mismatch",
      );
    }

    const personalEmail = contract.personal_email?.trim().toLowerCase() ?? "";
    const workspaceDomain = getEmailDomain().toLowerCase();
    if (!personalEmail || !personalEmail.includes("@")) {
      return errorResponse(
        "Your signed contract is missing a personal email. Please sign the agreement again.",
        400,
        "missing_personal_email",
      );
    }
    if (personalEmail.endsWith(`@${workspaceDomain}`)) {
      return errorResponse(
        "Your personal email on the contract cannot be a @thepncl.com address. Please sign the agreement again with a personal email.",
        400,
        "invalid_personal_email",
      );
    }

    if (await findActiveOnboardingBySsnHash(supabase, ssnHash)) {
      return errorResponse(
        "An account already exists for this applicant. Contact PNCL support if you need help.",
        409,
        "duplicate_applicant",
      );
    }

    if (await findActiveOnboardingByPhoneNumber(supabase, payload.phoneNumber)) {
      logOnboarding(
        "submit_duplicate_phone_rejected",
        { requestId, phoneNumber: payload.phoneNumber },
        "warn",
      );
      return errorResponse(
        "This phone number is already linked to another PNCL account. Each agent needs their own mobile number for Google account verification. Contact PNCL support if you need help.",
        409,
        "duplicate_phone",
      );
    }

    let uplineNetwork = payload.uplineNetwork;
    let referrerUserId: string | null = null;
    let referralInviteId: string | null = null;
    let invitedCompLevel: number | null = null;

    if (payload.referralInviteId) {
      const resolvedInvite = await resolveReferralInviteForOnboarding(
        supabase,
        payload.referralInviteId,
      );

      if (!resolvedInvite) {
        return errorResponse("This referral link is invalid or expired.", 400, "invalid_referral");
      }

      const claimedInvite = await claimReferralInvite(supabase, resolvedInvite.invite.id);
      claimedInviteId = claimedInvite.id;
      referralInviteId = claimedInvite.id;
      referrerUserId = resolvedInvite.referrerId;
      invitedCompLevel = resolvedInvite.compLevel;
      uplineNetwork = resolvedInvite.referrerName;
    }

    const handoffToken = generateHandoffToken();
    const handoffTokenHash = await hashHandoffToken(handoffToken);
    const handoffTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
        ssn_hash: ssnHash,
        state_of_residence: payload.stateOfResidence,
        address_line1: payload.addressLine1 ?? null,
        address_city: payload.addressCity ?? null,
        address_zip: payload.addressZip ?? null,
        county: payload.county ?? null,
        upline_network: uplineNetwork,
        has_license: payload.hasLicense,
        npn: payload.npn ?? null,
        has_eo_insurance: payload.hasEoInsurance,
        has_other_imo: payload.hasOtherImo,
        personal_email: contract.personal_email,
        contract_signature_id: payload.contractSignatureId,
        referrer_user_id: referrerUserId,
        referral_invite_id: referralInviteId,
        invited_comp_level: invitedCompLevel,
        workspace_email: workspaceEmail,
        status: "pending",
        enrollment_status: "saving_application",
        referral_status: referralInviteId ? "claimed" : "none",
        contract_status: "signed",
        application_status: "saving",
        google_account_status: "pending",
        portal_account_status: "pending",
        finalization_status: "pending",
        referral_validated_at: referralInviteId ? new Date().toISOString() : null,
        contract_signed_at: contract.signed_at,
        application_saved_at: null,
        handoff_token_hash: handoffTokenHash,
        handoff_token_expires_at: handoffTokenExpiresAt,
        temporary_password_encrypted: temporaryPasswordEncrypted,
      })
      .select("id")
      .single();

    if (insertError || !record) {
      if (claimedInviteId) {
        await releaseReferralInvite(supabase, claimedInviteId);
      }

      if (insertError?.code === "23505") {
        return errorResponse(
          "An account already exists for this applicant. Contact PNCL support if you need help.",
          409,
          "duplicate_applicant",
        );
      }

      logOnboarding(
        "submit_db_insert_failed",
        { requestId, workspaceEmail, error: insertError?.message ?? "no record returned" },
        "error",
      );
      return errorResponse("Unable to create onboarding record", 500);
    }

    const onboardingId = record.id;
    createdOnboardingId = onboardingId;

    const { error: contractLinkError } = await supabase
      .from("onboarding_contract_signatures")
      .update({ onboarding_id: onboardingId })
      .eq("id", payload.contractSignatureId)
      .is("onboarding_id", null);

    if (contractLinkError) {
      logOnboarding(
        "submit_contract_link_failed",
        { requestId, onboardingId, error: contractLinkError.message },
        "error",
      );
    }

    if (claimedInviteId) {
      await attachOnboardingToReferralInvite(supabase, claimedInviteId, onboardingId);
    }

    await persistApplicationAssets(supabase, onboardingId, payload, requestId);

    logOnboarding("submit_db_record_created", { requestId, onboardingId, workspaceEmail });
    const result = await provisionEnrollment(supabase, onboardingId, {
      requestId,
      driversLicense: payload.driversLicenseImage,
      profilePhoto: payload.profilePhotoImage,
    });

    if (result.status === "ready") {
      const completedAt = new Date().toISOString();
      try {
        await notifyGoogleWorkspaceAdminOfFirstSignIn({ legalName: payload.legalName, workspaceEmail });
      } catch (notificationError) {
        logOnboarding("submit_google_first_signin_notification_failed", {
          requestId,
          onboardingId,
          error: notificationError instanceof Error ? notificationError.message : "notification failed",
        }, "error");
      }
      try {
        await notifyGenesisAdminsOfNewOnboarding(supabase, onboardingId, {
          legalName: payload.legalName,
          workspaceEmail,
          phoneNumber: payload.phoneNumber,
          dateOfBirth: payload.dateOfBirth,
          stateOfResidence: payload.stateOfResidence,
          uplineNetwork,
          hasLicense: payload.hasLicense,
          npn: payload.npn ?? null,
          hasEoInsurance: payload.hasEoInsurance,
          hasOtherImo: payload.hasOtherImo,
          completedAt,
        });
      } catch (notificationError) {
        logOnboarding("submit_genesis_notification_failed", {
          requestId,
          onboardingId,
          error: notificationError instanceof Error ? notificationError.message : "notification failed",
        }, "error");
      }
    } else if (result.failureCode === "google_verification_required") {
      try {
        await notifyGoogleWorkspaceAdminOfFirstSignIn({
          legalName: payload.legalName,
          workspaceEmail,
          autoSuspended: true,
        });
        await notifySuspendedGmailForOnboarding(supabase, {
          onboardingId,
          handoffToken,
          forceResend: true,
        });
      } catch (notificationError) {
        logOnboarding("submit_gmail_verification_notification_failed", {
          requestId,
          onboardingId,
          error: notificationError instanceof Error ? notificationError.message : "notification failed",
        }, "error");
      }
    }

    return jsonResponse({
      onboardingId,
      handoffToken,
      status: result.status,
      enrollmentStatus: result.enrollmentStatus,
      workspaceEmail,
      ...(result.userMessage ? { error: result.userMessage } : {}),
      ...(result.failedStep ? { failedStep: result.failedStep } : {}),
    });
  } catch (error) {
    if (claimedInviteId && !createdOnboardingId) {
      try {
        const supabase = getServiceClient();
        await releaseReferralInvite(supabase, claimedInviteId);
      } catch {
        // Best effort release if submit fails before onboarding record creation.
      }
    }

    const message = error instanceof Error ? error.message : "Invalid request";
    logOnboarding("submit_request_failed", { requestId, error: message }, "error");
    return errorResponse(message, 400);
  }
});
