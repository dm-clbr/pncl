import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { generateAvailableWorkspaceEmail } from "../_shared/email.ts";
import { createWorkspaceUser, GoogleWorkspaceAutoSuspendedError, waitForWorkspaceMailboxReady } from "../_shared/googleWorkspace.ts";
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
  validateSubmitPayload,
} from "../_shared/onboarding.ts";
import { provisionPortalAccount } from "../_shared/portalAuth.ts";
import { syncOnboardingProfileAssets } from "../_shared/portalProfileSetup.ts";
import { notifyGenesisAdminsOfNewOnboarding } from "../_shared/genesisNotifications.ts";
import { notifyGoogleWorkspaceAdminOfFirstSignIn } from "../_shared/googleFirstSignInNotifications.ts";
import {
  attachOnboardingToReferralInvite,
  claimReferralInvite,
  findActiveOnboardingByPhoneNumber,
  findActiveOnboardingBySsnHash,
  releaseReferralInvite,
  resolveReferralInviteForOnboarding,
  upsertPortalProfileCompLevel,
} from "../_shared/portalReferralInvites.ts";
import {
  encryptTemporaryPassword,
  generateHandoffToken,
  generateTemporaryPassword,
  hashHandoffToken,
  hashSsn,
} from "../_shared/security.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const requestId = crypto.randomUUID();
  let claimedInviteId: string | null = null;

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

    if (contract.onboarding_id) {
      return errorResponse(
        "This signed contract has already been used. Please sign the agreement again.",
        409,
        "contract_already_used",
      );
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

    const ssnHash = await hashSsn(payload.ssn);

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
        ssn_hash: ssnHash,
        state_of_residence: payload.stateOfResidence,
        upline_network: uplineNetwork,
        has_license: payload.hasLicense,
        npn: payload.npn ?? null,
        has_eo_insurance: payload.hasEoInsurance,
        personal_email: contract.personal_email,
        referrer_user_id: referrerUserId,
        referral_invite_id: referralInviteId,
        invited_comp_level: invitedCompLevel,
        workspace_email: workspaceEmail,
        status: "creating_email",
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

    if (payload.driversLicenseImage) {
      const driversLicensePath =
        `licenses/${onboardingId}/drivers-license.${payload.driversLicenseImage.extension}`;
      const { error: licenseUploadError } = await supabase.storage
        .from(ONBOARDING_CONTRACT_BUCKET)
        .upload(driversLicensePath, decodeImageBytes(payload.driversLicenseImage), {
          upsert: true,
          contentType: payload.driversLicenseImage.contentType,
        });

      if (licenseUploadError) {
        logOnboarding(
          "submit_drivers_license_upload_failed",
          { requestId, onboardingId, error: licenseUploadError.message },
          "error",
        );
      } else {
        const { error: licensePathError } = await supabase
          .from("onboarding_records")
          .update({ drivers_license_path: driversLicensePath })
          .eq("id", onboardingId);

        if (licensePathError) {
          logOnboarding(
            "submit_drivers_license_path_update_failed",
            { requestId, onboardingId, error: licensePathError.message },
            "error",
          );
        }
      }
    }

    logOnboarding("submit_db_record_created", { requestId, onboardingId, workspaceEmail });

    let finalStatus = "creating_email";
    let failureError: string | undefined;

    try {
      const googleUserId = await createWorkspaceUser({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: workspaceEmail,
        temporaryPassword,
        recoveryEmail: personalEmail,
      });

      await waitForWorkspaceMailboxReady(workspaceEmail);

      finalStatus = "ready";
      let supabaseUserId: string | null = null;
      let portalProvisionError: string | undefined;
      const completedAt = new Date().toISOString();

      try {
        supabaseUserId = await provisionPortalAccount(supabase, {
          email: workspaceEmail,
          legalName: payload.legalName,
          firstName: payload.firstName,
          lastName: payload.lastName,
          onboardingId,
        });

        if (supabaseUserId && invitedCompLevel != null) {
          await upsertPortalProfileCompLevel(
            supabase,
            supabaseUserId,
            invitedCompLevel,
            payload.firstName,
            payload.lastName,
          );
        }

        if (supabaseUserId) {
          await syncOnboardingProfileAssets(supabase, {
            userId: supabaseUserId,
            onboardingId,
            firstName: payload.firstName,
            lastName: payload.lastName,
            npn: payload.npn ?? null,
            driversLicense: payload.driversLicenseImage,
            profilePhoto: payload.profilePhotoImage,
          });
        }
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
          onboarding_completed_at: completedAt,
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
          invitedCompLevel,
        });

        try {
          await notifyGoogleWorkspaceAdminOfFirstSignIn({
            legalName: payload.legalName,
            workspaceEmail,
          });
        } catch (notificationError) {
          const message = notificationError instanceof Error
            ? notificationError.message
            : "Google first sign-in admin notification failed";
          logOnboarding(
            "submit_google_first_signin_notification_failed",
            { requestId, onboardingId, error: message },
            "error",
          );
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
            completedAt,
          });
        } catch (notificationError) {
          const message = notificationError instanceof Error
            ? notificationError.message
            : "Genesis admin notification failed";
          logOnboarding(
            "submit_genesis_notification_failed",
            { requestId, onboardingId, error: message },
            "error",
          );
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Google Workspace user creation failed";
      const isAutoSuspended = error instanceof GoogleWorkspaceAutoSuspendedError
        || errorMessage.includes("automatically suspended");
      const autoSuspendedGoogleUserId = error instanceof GoogleWorkspaceAutoSuspendedError
        ? error.googleUserId
        : null;
      logOnboarding(
        "submit_google_provisioning_failed",
        { requestId, onboardingId, workspaceEmail, error: errorMessage, isAutoSuspended },
        "error",
      );
      failureError = isAutoSuspended
        ? "Your PNCL email was created but Google requires verification before you can sign in. Check your personal email for next steps."
        : errorMessage;
      finalStatus = "failed";
      await supabase
        .from("onboarding_records")
        .update({
          status: "failed",
          google_creation_error: errorMessage,
          google_user_id: autoSuspendedGoogleUserId,
          temporary_password_encrypted: isAutoSuspended ? temporaryPasswordEncrypted : null,
        })
        .eq("id", onboardingId);

      if (isAutoSuspended) {
        try {
          await notifyGoogleWorkspaceAdminOfFirstSignIn({
            legalName: payload.legalName,
            workspaceEmail,
            autoSuspended: true,
          });
        } catch (notificationError) {
          const message = notificationError instanceof Error
            ? notificationError.message
            : "Google first sign-in admin notification failed";
          logOnboarding(
            "submit_google_first_signin_notification_failed",
            { requestId, onboardingId, error: message },
            "error",
          );
        }

        try {
          await notifySuspendedGmailForOnboarding(supabase, {
            onboardingId,
            handoffToken,
            forceResend: true,
          });
        } catch (notificationError) {
          const message = notificationError instanceof Error
            ? notificationError.message
            : "Gmail verification notification failed";
          logOnboarding(
            "submit_gmail_verification_notification_failed",
            { requestId, onboardingId, workspaceEmail, error: message },
            "error",
          );
        }
      }

      if (claimedInviteId && !isAutoSuspended) {
        await releaseReferralInvite(supabase, claimedInviteId);
      }
    }

    return jsonResponse({
      onboardingId,
      handoffToken,
      status: finalStatus,
      workspaceEmail,
      ...(failureError ? { error: failureError } : {}),
    });
  } catch (error) {
    if (claimedInviteId) {
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
