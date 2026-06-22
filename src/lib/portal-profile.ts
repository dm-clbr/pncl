import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

export const PROFILE_PHOTO_BUCKET = "portal-profile-photos";
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
export const WAIST_SIZES = ["28", "30", "32", "34", "36", "38", "40", "42", "44", "46", "48"] as const;
export const SHOE_SIZES = [
  "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13", "14",
] as const;

export interface PortalProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  shirt_size: string | null;
  polo_shirt_size: string | null;
  hoodie_size: string | null;
  waist_size: string | null;
  shoe_size: string | null;
  profile_photo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalProfileFormValues {
  firstName: string;
  lastName: string;
  shirtSize: string;
  poloShirtSize: string;
  hoodieSize: string;
  waistSize: string;
  shoeSize: string;
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
  };
}

export function getProfilePhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
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
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
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
    throw new Error("Profile photo must be 5 MB or smaller.");
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

export function getProfileInitials(firstName: string, lastName: string): string {
  const first = firstName.trim()[0] ?? "";
  const last = lastName.trim()[0] ?? "";
  return (first + last).toUpperCase() || "?";
}
