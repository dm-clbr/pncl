import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseConfig } from "@/lib/supabase";

export const PROFILE_PHOTO_BUCKET = "portal-profile-photos";
export const PROFILE_DOCUMENTS_BUCKET = "portal-profile-documents";
export const MAX_PROFILE_PHOTO_BYTES = 300 * 1024;
export const MAX_DRIVERS_LICENSE_BYTES = 5 * 1024 * 1024;

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
export const WAIST_SIZES = ["28", "30", "32", "34", "36", "38", "40", "42", "44", "46", "48"] as const;
export const SHOE_SIZES = [
  "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13", "14",
] as const;

export interface PortalProfile {
  user_id: string;
  agent_number: number | null;
  first_name: string;
  last_name: string;
  shirt_size: string | null;
  polo_shirt_size: string | null;
  hoodie_size: string | null;
  waist_size: string | null;
  shoe_size: string | null;
  comp_level: number | null;
  profile_photo_path: string | null;
  npn: string | null;
  eo_policy_number: string | null;
  eo_certificate_path: string | null;
  state_licenses: string[] | null;
  drivers_license_path: string | null;
  address_line1: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  county: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalLicensingFormValues {
  npn: string;
  eoPolicyNumber: string;
  stateLicenses: string[];
}

export interface PortalProfileFormValues {
  firstName: string;
  lastName: string;
  shirtSize: string;
  poloShirtSize: string;
  hoodieSize: string;
  waistSize: string;
  shoeSize: string;
  addressLine1: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  county: string;
}

function readMetadataString(user: User | null, key: string): string {
  const value = user?.user_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function getDefaultProfileValues(user: User | null): PortalProfileFormValues {
  const firstName = readMetadataString(user, "first_name");
  const lastName = readMetadataString(user, "last_name");
  const fullName = readMetadataString(user, "full_name");

  let resolvedFirst = firstName;
  let resolvedLast = lastName;

  if (!resolvedFirst && fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    resolvedFirst = parts[0] ?? "";
    resolvedLast = parts.slice(1).join(" ");
  }

  return {
    firstName: resolvedFirst,
    lastName: resolvedLast,
    shirtSize: "",
    poloShirtSize: "",
    hoodieSize: "",
    waistSize: "",
    shoeSize: "",
    addressLine1: "",
    addressCity: "",
    addressState: "",
    addressZip: "",
    county: "",
  };
}

export function profileToFormValues(profile: PortalProfile): PortalProfileFormValues {
  return {
    firstName: profile.first_name ?? "",
    lastName: profile.last_name ?? "",
    shirtSize: profile.shirt_size ?? "",
    poloShirtSize: profile.polo_shirt_size ?? "",
    hoodieSize: profile.hoodie_size ?? "",
    waistSize: profile.waist_size ?? "",
    shoeSize: profile.shoe_size ?? "",
    addressLine1: profile.address_line1 ?? "",
    addressCity: profile.address_city ?? "",
    addressState: profile.address_state ?? "",
    addressZip: profile.address_zip ?? "",
    county: profile.county ?? "",
  };
}

export function getProfilePhotoUrl(
  path: string | null | undefined,
  cacheBuster?: string | number | null,
): string | null {
  if (!path) return null;
  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(path);
  if (cacheBuster == null) return data.publicUrl;
  const separator = data.publicUrl.includes("?") ? "&" : "?";
  return `${data.publicUrl}${separator}v=${encodeURIComponent(String(cacheBuster))}`;
}

export async function fetchPortalProfile(userId: string): Promise<PortalProfile | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as PortalProfile | null;
}

function getPhotoExtension(file: File): string {
  if (file.type === "image/jpeg") return "jpg";
  const byType: Record<string, string> = {
    "image/png": "png",
    "image/webp": "webp",
  };
  return byType[file.type] ?? "jpg";
}

export async function uploadProfilePhoto(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Profile photo must be an image file.");
  }
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error("Profile photo must be 300 KB or smaller.");
  }

  const supabase = getSupabaseClient();
  const path = `${userId}/avatar.${getPhotoExtension(file)}`;

  const { error } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;
  return path;
}

export async function savePortalProfile(
  user: User,
  values: PortalProfileFormValues,
  photoFile: File | null,
  existingPhotoPath: string | null,
): Promise<PortalProfile> {
  const supabase = getSupabaseClient();
  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();

  if (!firstName || !lastName) {
    throw new Error("First name and last name are required.");
  }

  let profilePhotoPath = existingPhotoPath;
  if (photoFile) {
    profilePhotoPath = await uploadProfilePhoto(user.id, photoFile);
  }

  const payload = {
    user_id: user.id,
    first_name: firstName,
    last_name: lastName,
    shirt_size: values.shirtSize || null,
    polo_shirt_size: values.poloShirtSize || null,
    hoodie_size: values.hoodieSize || null,
    waist_size: values.waistSize || null,
    shoe_size: values.shoeSize || null,
    address_line1: values.addressLine1.trim() || null,
    address_city: values.addressCity.trim() || null,
    address_state: values.addressState || null,
    address_zip: values.addressZip.trim() || null,
    county: values.county.trim() || null,
    profile_photo_path: profilePhotoPath,
  };

  const { data, error } = await supabase
    .from("portal_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) throw error;

  const fullName = `${firstName} ${lastName}`.trim();
  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
    },
  });

  if (metadataError) throw metadataError;

  return data as PortalProfile;
}

/**
 * Best-effort ping so admins get a "ready for contracting" email once the
 * agent has both an NPN and E&O policy number on file. Server dedupes.
 */
export async function notifyLicensingComplete(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;

    const { url, anonKey } = getSupabaseConfig();
    await fetch(`${url.replace(/\/$/, "")}/functions/v1/notify-licensing-complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch {
    // Notification is best-effort; saving licensing details already succeeded.
  }
}

/** Formats the auto-assigned agent number as the display ID, e.g. PNCL-00042. */
export function formatAgentNumber(agentNumber: number | null | undefined): string | null {
  if (agentNumber === null || agentNumber === undefined) return null;
  return `PNCL-${String(agentNumber).padStart(5, "0")}`;
}

export function getProfileInitials(firstName: string, lastName: string): string {
  const first = firstName.trim()[0] ?? "";
  const last = lastName.trim()[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

export function profileToLicensingValues(profile: PortalProfile | null): PortalLicensingFormValues {
  return {
    npn: profile?.npn ?? "",
    eoPolicyNumber: profile?.eo_policy_number ?? "",
    stateLicenses: profile?.state_licenses ?? [],
  };
}

export async function getDriversLicenseUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(PROFILE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function uploadDriversLicense(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Driver's license must be an image file.");
  }
  if (file.size > MAX_DRIVERS_LICENSE_BYTES) {
    throw new Error("Driver's license image must be 5 MB or smaller.");
  }

  const supabase = getSupabaseClient();
  const path = `${userId}/drivers-license.${getPhotoExtension(file)}`;

  const { error } = await supabase.storage
    .from(PROFILE_DOCUMENTS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;
  return path;
}

const EO_CERTIFICATE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadEoCertificate(userId: string, file: File): Promise<string> {
  const extension = EO_CERTIFICATE_TYPES[file.type];
  if (!extension) {
    throw new Error("E&O certificate must be a PDF, JPG, PNG, or WebP file.");
  }
  if (file.size > MAX_DRIVERS_LICENSE_BYTES) {
    throw new Error("E&O certificate must be 5 MB or smaller.");
  }

  const supabase = getSupabaseClient();
  const path = `${userId}/eo-certificate.${extension}`;

  const { error } = await supabase.storage
    .from(PROFILE_DOCUMENTS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;
  return path;
}

export async function getEoCertificateUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(PROFILE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function saveLicensingProfile(
  user: User,
  names: { firstName: string; lastName: string },
  values: PortalLicensingFormValues,
  driversLicenseFile: File | null,
  existingDriversLicensePath: string | null,
  eoCertificateFile: File | null = null,
  existingEoCertificatePath: string | null = null,
): Promise<PortalProfile> {
  const supabase = getSupabaseClient();

  let driversLicensePath = existingDriversLicensePath;
  if (driversLicenseFile) {
    driversLicensePath = await uploadDriversLicense(user.id, driversLicenseFile);
  }

  let eoCertificatePath = existingEoCertificatePath;
  if (eoCertificateFile) {
    eoCertificatePath = await uploadEoCertificate(user.id, eoCertificateFile);
  }

  const licensingColumns = {
    npn: values.npn.trim() || null,
    eo_policy_number: values.eoPolicyNumber.trim() || null,
    state_licenses: values.stateLicenses,
    drivers_license_path: driversLicensePath,
    eo_certificate_path: eoCertificatePath,
  };

  const { data: existing, error: existingError } = await supabase
    .from("portal_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const { data, error } = await supabase
      .from("portal_profiles")
      .update(licensingColumns)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) throw error;
    return data as PortalProfile;
  }

  const fallbackNames = getDefaultProfileValues(user);
  const { data, error } = await supabase
    .from("portal_profiles")
    .insert({
      user_id: user.id,
      first_name: names.firstName.trim() || fallbackNames.firstName,
      last_name: names.lastName.trim() || fallbackNames.lastName,
      ...licensingColumns,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as PortalProfile;
}
