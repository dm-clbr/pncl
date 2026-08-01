import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createWorkspaceUser,
  getWorkspaceUser,
  GoogleWorkspaceAutoSuspendedError,
  isAutomaticallySuspendedGoogleUser,
  waitForWorkspaceMailboxReady,
} from "./googleWorkspace.ts";
import type { OnboardingImagePayload } from "./onboarding.ts";
import { markPortalEnrollmentReady, provisionPortalAccount } from "./portalAuth.ts";
import { syncOnboardingProfileAssets } from "./portalProfileSetup.ts";
import {
  attachOnboardingToReferralInvite,
  findActiveOnboardingByPhoneNumber,
  findActiveOnboardingBySsnHash,
  upsertPortalProfileCompLevel,
} from "./portalReferralInvites.ts";
import {
  decryptTemporaryPassword,
  encryptTemporaryPassword,
  generateTemporaryPassword,
} from "./security.ts";
import { logOnboarding } from "./logger.ts";
import { isEnrollmentReady } from "./enrollmentState.ts";

export interface EnrollmentProvisioningResult {
  onboardingId: string;
  status: "ready" | "failed" | "creating_email";
  enrollmentStatus: string;
  workspaceEmail: string;
  googleUserId: string | null;
  supabaseUserId: string | null;
  failedStep?: string;
  failureCode?: string;
  userMessage?: string;
}

export interface EnrollmentProvisioningOptions {
  requestId?: string;
  driversLicense?: OnboardingImagePayload;
  profilePhoto?: OnboardingImagePayload;
}

interface EnrollmentRow {
  id: string;
  legal_name: string;
  first_name: string;
  last_name: string;
  personal_email: string;
  workspace_email: string;
  temporary_password_encrypted: string | null;
  google_user_id: string | null;
  supabase_user_id: string | null;
  referral_invite_id: string | null;
  contract_signature_id: string | null;
  invited_comp_level: number | null;
  npn: string | null;
  address_line1: string | null;
  address_city: string | null;
  address_zip: string | null;
  county: string | null;
  state_of_residence: string;
  enrollment_status: string;
  referral_status: string;
  contract_status: string;
  application_status: string;
  google_account_status: string;
  portal_account_status: string;
  finalization_status: string;
  ssn_hash: string;
  phone_number: string;
  released_at: string | null;
}

function errorDetail(error: unknown): string {
  const detail = error instanceof Error ? error.message : "Unknown provisioning error";
  return detail.slice(0, 1000);
}

async function updateRecord(
  supabase: SupabaseClient,
  onboardingId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("onboarding_records").update(values).eq("id", onboardingId);
  if (error) throw new Error(error.message);
}

async function failStep(
  supabase: SupabaseClient,
  row: EnrollmentRow,
  step: "application" | "google" | "portal" | "finalization",
  code: string,
  error: unknown,
  ids: { googleUserId?: string | null; supabaseUserId?: string | null } = {},
): Promise<EnrollmentProvisioningResult> {
  const detail = errorDetail(error);
  const verificationRequired = code === "google_verification_required";
  const identityConflict = code === "identity_reserved_by_another_enrollment";
  const googleUserId = ids.googleUserId ?? row.google_user_id;
  const supabaseUserId = ids.supabaseUserId ?? row.supabase_user_id;
  const now = new Date().toISOString();
  const stepUpdates = step === "application"
    ? { application_status: "failed" }
    : step === "google"
    ? { google_account_status: verificationRequired ? "verification_required" : "failed" }
    : step === "portal"
      ? { portal_account_status: "failed" }
      : { finalization_status: "failed" };

  await updateRecord(supabase, row.id, {
    status: "failed",
    enrollment_status: verificationRequired ? "google_verification_required" : "needs_attention",
    failed_step: step,
    failure_code: code,
    failure_detail: detail,
    google_creation_error: step === "google" ? detail : null,
    google_user_id: googleUserId,
    supabase_user_id: supabaseUserId,
    // A failed attempt with no external identity must not indefinitely reserve
    // the applicant's SSN/phone. External accounts always retain the hold.
    released_at: googleUserId || supabaseUserId ? null : now,
    provisioning_lock_token: null,
    provisioning_lock_expires_at: null,
    ...stepUpdates,
  });

  return {
    onboardingId: row.id,
    status: "failed",
    enrollmentStatus: verificationRequired ? "google_verification_required" : "needs_attention",
    workspaceEmail: row.workspace_email,
    googleUserId,
    supabaseUserId,
    failedStep: step,
    failureCode: code,
    userMessage: identityConflict
      ? "Another active enrollment already protects this applicant. Contact PNCL support before retrying."
      : verificationRequired
      ? "Your PNCL email was created, but Google requires verification before setup can continue."
      : "We could not finish account setup. Your progress is saved and can be retried safely.",
  };
}

/**
 * Idempotent enrollment coordinator. Every successful side effect is persisted
 * before moving to the next step, so a retry resumes instead of duplicating a
 * Google or portal account.
 */
export async function provisionEnrollment(
  supabase: SupabaseClient,
  onboardingId: string,
  options: EnrollmentProvisioningOptions = {},
): Promise<EnrollmentProvisioningResult> {
  const { data, error } = await supabase
    .from("onboarding_records")
    .select("*")
    .eq("id", onboardingId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Enrollment not found");

  const row = data as EnrollmentRow;
  if (row.enrollment_status !== "awaiting_google_sign_in" && isEnrollmentReady(row) && row.google_user_id && row.supabase_user_id) {
    try {
      await markPortalEnrollmentReady(supabase, row.supabase_user_id, onboardingId);
      return {
        onboardingId,
        status: "ready",
        enrollmentStatus: "ready",
        workspaceEmail: row.workspace_email,
        googleUserId: row.google_user_id,
        supabaseUserId: row.supabase_user_id,
      };
    } catch (readyError) {
      return await failStep(supabase, row, "finalization", "portal_activation_failed", readyError);
    }
  }

  if (row.released_at && !row.google_user_id && !row.supabase_user_id) {
    const identityClaimedElsewhere = await findActiveOnboardingBySsnHash(supabase, row.ssn_hash)
      || await findActiveOnboardingByPhoneNumber(supabase, row.phone_number);
    if (identityClaimedElsewhere) {
      return await failStep(
        supabase,
        row,
        "application",
        "identity_reserved_by_another_enrollment",
        "Another active enrollment now protects this applicant identity.",
      );
    }
  }

  const now = new Date().toISOString();
  const lockToken = crypto.randomUUID();
  const lockExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data: locked, error: lockError } = await supabase
    .from("onboarding_records")
    .update({ provisioning_lock_token: lockToken, provisioning_lock_expires_at: lockExpiresAt })
    .eq("id", onboardingId)
    .or(`provisioning_lock_expires_at.is.null,provisioning_lock_expires_at.lt.${now}`)
    .select("id")
    .maybeSingle();
  if (lockError) throw new Error(lockError.message);
  if (!locked) {
    return {
      onboardingId,
      status: "creating_email",
      enrollmentStatus: row.enrollment_status,
      workspaceEmail: row.workspace_email,
      googleUserId: row.google_user_id,
      supabaseUserId: row.supabase_user_id,
      userMessage: "Account setup is already in progress.",
    };
  }

  await updateRecord(supabase, onboardingId, {
    status: "creating_email",
    enrollment_status: "provisioning_google",
    google_account_status: "provisioning",
    failed_step: null,
    failure_code: null,
    failure_detail: null,
    released_at: null,
    last_provisioning_attempt_at: now,
    provisioning_attempts: (Number((data as { provisioning_attempts?: number }).provisioning_attempts) || 0) + 1,
  });

  let encryptedPassword = row.temporary_password_encrypted;
  let temporaryPassword: string;
  if (encryptedPassword) {
    temporaryPassword = await decryptTemporaryPassword(encryptedPassword);
  } else {
    temporaryPassword = generateTemporaryPassword();
    encryptedPassword = await encryptTemporaryPassword(temporaryPassword);
    await updateRecord(supabase, onboardingId, { temporary_password_encrypted: encryptedPassword });
  }

  let googleUserId = row.google_user_id;
  try {
    const existingGoogleUser = await getWorkspaceUser(row.workspace_email);
    if (existingGoogleUser) {
      googleUserId = existingGoogleUser.id;
      if (existingGoogleUser.suspended) {
        const code = isAutomaticallySuspendedGoogleUser(existingGoogleUser)
          ? "google_verification_required"
          : "google_account_suspended";
        return await failStep(supabase, row, "google", code, existingGoogleUser.suspensionReason ?? code, {
          googleUserId,
        });
      }
    } else {
      googleUserId = await createWorkspaceUser({
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.workspace_email,
        temporaryPassword,
        recoveryEmail: row.personal_email,
      });
    }

    await updateRecord(supabase, onboardingId, {
      google_user_id: googleUserId,
      google_account_status: "ready",
      google_provisioned_at: new Date().toISOString(),
      google_creation_error: null,
      released_at: null,
    });
    await waitForWorkspaceMailboxReady(row.workspace_email);
  } catch (error) {
    if (error instanceof GoogleWorkspaceAutoSuspendedError) {
      googleUserId = error.googleUserId;
      return await failStep(supabase, row, "google", "google_verification_required", error, { googleUserId });
    }
    logOnboarding("enrollment_google_failed", {
      requestId: options.requestId ?? null,
      onboardingId,
      error: errorDetail(error),
    }, "error");
    return await failStep(supabase, row, "google", "google_provisioning_failed", error, { googleUserId });
  }

  await updateRecord(supabase, onboardingId, {
    enrollment_status: "provisioning_portal",
    portal_account_status: "provisioning",
  });

  let supabaseUserId = row.supabase_user_id;
  try {
    supabaseUserId = await provisionPortalAccount(supabase, {
      email: row.workspace_email,
      legalName: row.legal_name,
      firstName: row.first_name,
      lastName: row.last_name,
      onboardingId,
      existingSupabaseUserId: supabaseUserId,
    });
    await updateRecord(supabase, onboardingId, {
      supabase_user_id: supabaseUserId,
      portal_account_status: "ready",
      portal_linked_at: new Date().toISOString(),
    });
  } catch (error) {
    logOnboarding("enrollment_portal_failed", {
      requestId: options.requestId ?? null,
      onboardingId,
      error: errorDetail(error),
    }, "error");
    return await failStep(supabase, row, "portal", "portal_provisioning_failed", error, {
      googleUserId,
      supabaseUserId,
    });
  }

  await updateRecord(supabase, onboardingId, {
    enrollment_status: "finalizing",
    finalization_status: "finalizing",
  });

  try {
    if (supabaseUserId && row.invited_comp_level != null) {
      await upsertPortalProfileCompLevel(
        supabase,
        supabaseUserId,
        row.invited_comp_level,
        row.first_name,
        row.last_name,
      );
    }

    if (!supabaseUserId) throw new Error("Portal user was not linked");
    await syncOnboardingProfileAssets(supabase, {
      userId: supabaseUserId,
      onboardingId,
      firstName: row.first_name,
      lastName: row.last_name,
      npn: row.npn,
      driversLicense: options.driversLicense,
      profilePhoto: options.profilePhoto,
      address: {
        line1: row.address_line1,
        city: row.address_city,
        state: row.state_of_residence,
        zip: row.address_zip,
        county: row.county,
      },
    });

    if (row.referral_invite_id) {
      await attachOnboardingToReferralInvite(supabase, row.referral_invite_id, onboardingId);
    }
    if (row.contract_signature_id) {
      const { error: contractError } = await supabase
        .from("onboarding_contract_signatures")
        .update({ onboarding_id: onboardingId })
        .eq("id", row.contract_signature_id)
        .or(`onboarding_id.is.null,onboarding_id.eq.${onboardingId}`);
      if (contractError) throw new Error(contractError.message);
    }

    const completedAt = new Date().toISOString();
    const finalStepState = {
      referral_status: row.referral_invite_id ? "finalized" : "none",
      contract_status: "finalized",
      application_status: "finalized",
      google_account_status: "ready",
      portal_account_status: "ready",
      finalization_status: "ready",
    };
    if (!isEnrollmentReady(finalStepState)) {
      throw new Error("Enrollment prerequisites are incomplete");
    }
    await updateRecord(supabase, onboardingId, finalStepState);
    // The account is provisioned, but the recruit must still sign in to
    // Google and change the temporary password before Google OAuth can safely
    // unlock the PNCL portal.
    await updateRecord(supabase, onboardingId, {
      enrollment_status: "awaiting_google_sign_in",
      status: "email_created",
      failed_step: null,
      failure_code: null,
      failure_detail: null,
      onboarding_completed_at: completedAt,
      finalized_at: completedAt,
      released_at: null,
      provisioning_lock_token: null,
      provisioning_lock_expires_at: null,
    });
    return {
      onboardingId,
      status: "creating_email",
      enrollmentStatus: "awaiting_google_sign_in",
      workspaceEmail: row.workspace_email,
      googleUserId,
      supabaseUserId,
    };
  } catch (error) {
    logOnboarding("enrollment_finalization_failed", {
      requestId: options.requestId ?? null,
      onboardingId,
      error: errorDetail(error),
    }, "error");
    return await failStep(supabase, row, "finalization", "finalization_failed", error, {
      googleUserId,
      supabaseUserId,
    });
  }
}
