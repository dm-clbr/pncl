import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decodeImageBytes, type OnboardingImagePayload } from "./onboarding.ts";
import { logOnboarding } from "./logger.ts";

export const PORTAL_PROFILE_DOCUMENTS_BUCKET = "portal-profile-documents";
export const PORTAL_PROFILE_PHOTOS_BUCKET = "portal-profile-photos";

export function getPortalDriversLicensePath(userId: string, extension: string): string {
  return `${userId}/drivers-license.${extension}`;
}

export interface SyncOnboardingProfileAssetsInput {
  userId: string;
  onboardingId: string;
  firstName: string;
  lastName: string;
  npn?: string | null;
  driversLicense?: OnboardingImagePayload;
  profilePhoto?: OnboardingImagePayload;
  address?: {
    line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
  };
}

/**
 * Copies assets collected during public onboarding onto the agent's portal
 * profile so the phased checklist auto-completes. Best effort: failures are
 * logged and never block account provisioning.
 */
export async function syncOnboardingProfileAssets(
  supabase: SupabaseClient,
  input: SyncOnboardingProfileAssetsInput,
): Promise<void> {
  let driversLicensePath: string | null = null;
  let profilePhotoPath: string | null = null;

  if (input.driversLicense) {
    const path = getPortalDriversLicensePath(input.userId, input.driversLicense.extension);
    const { error } = await supabase.storage
      .from(PORTAL_PROFILE_DOCUMENTS_BUCKET)
      .upload(path, decodeImageBytes(input.driversLicense), {
        upsert: true,
        contentType: input.driversLicense.contentType,
      });

    if (error) {
      logOnboarding("portal_profile_drivers_license_upload_failed", {
        onboardingId: input.onboardingId,
        userId: input.userId,
        error: error.message,
      }, "error");
    } else {
      driversLicensePath = path;
    }
  }

  if (input.profilePhoto) {
    const path = `${input.userId}/avatar.${input.profilePhoto.extension}`;
    const { error } = await supabase.storage
      .from(PORTAL_PROFILE_PHOTOS_BUCKET)
      .upload(path, decodeImageBytes(input.profilePhoto), {
        upsert: true,
        contentType: input.profilePhoto.contentType,
      });

    if (error) {
      logOnboarding("portal_profile_photo_upload_failed", {
        onboardingId: input.onboardingId,
        userId: input.userId,
        error: error.message,
      }, "error");
    } else {
      profilePhotoPath = path;
    }
  }

  const npn = input.npn?.trim() ?? "";
  const address = input.address;
  const hasAddress = Boolean(
    address && (address.line1 || address.city || address.zip || address.county),
  );
  if (!driversLicensePath && !profilePhotoPath && !npn && !hasAddress) {
    return;
  }

  const payload: Record<string, unknown> = {
    user_id: input.userId,
    first_name: input.firstName,
    last_name: input.lastName,
  };
  if (driversLicensePath) payload.drivers_license_path = driversLicensePath;
  if (profilePhotoPath) payload.profile_photo_path = profilePhotoPath;
  if (npn) payload.npn = npn;
  if (hasAddress && address) {
    if (address.line1) payload.address_line1 = address.line1;
    if (address.city) payload.address_city = address.city;
    if (address.state) payload.address_state = address.state;
    if (address.zip) payload.address_zip = address.zip;
    if (address.county) payload.county = address.county;
  }

  const { error } = await supabase
    .from("portal_profiles")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    logOnboarding("portal_profile_onboarding_sync_failed", {
      onboardingId: input.onboardingId,
      userId: input.userId,
      error: error.message,
    }, "error");
  }
}
