import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getDirectDepositPdfPath } from "./portalDirectDeposit.ts";
import { getPortalIcaPdfPath } from "./portalIca.ts";
import { getW9PdfPath } from "./portalW9Pdf.ts";
import { encryptTemporaryPassword } from "./security.ts";
import {
  getPortalDriversLicensePath,
  getPortalEoCertificatePath,
  PORTAL_PROFILE_DOCUMENTS_BUCKET,
  PORTAL_PROFILE_PHOTOS_BUCKET,
} from "./portalProfileSetup.ts";

export const ADMIN_PROFILE_DOCUMENT_TYPES = [
  "drivers_license",
  "eo_certificate",
  "w9",
  "direct_deposit",
  "ica",
  "profile_photo",
  "other",
] as const;

export type AdminProfileDocumentType = (typeof ADMIN_PROFILE_DOCUMENT_TYPES)[number];

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_TYPE = "application/pdf";

const RESIGN_FLAGS: Partial<Record<AdminProfileDocumentType, string>> = {
  w9: "w9_resign_required",
  direct_deposit: "direct_deposit_resign_required",
  ica: "ica_resign_required",
};

export function isAdminProfileDocumentType(value: string): value is AdminProfileDocumentType {
  return (ADMIN_PROFILE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

function extensionForType(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case PDF_TYPE:
      return "pdf";
    default:
      throw new Error("Unsupported file type");
  }
}

export function validateAdminProfileDocumentFile(
  documentType: AdminProfileDocumentType,
  contentType: string,
): void {
  switch (documentType) {
    case "drivers_license":
    case "profile_photo":
      if (!IMAGE_TYPES.has(contentType)) {
        throw new Error("This document must be a JPG, PNG, or WebP image");
      }
      return;
    case "eo_certificate":
      if (!IMAGE_TYPES.has(contentType) && contentType !== PDF_TYPE) {
        throw new Error("E&O certificate must be a PDF or image");
      }
      return;
    case "w9":
    case "direct_deposit":
    case "ica":
      if (contentType !== PDF_TYPE) {
        throw new Error("This document must be a PDF");
      }
      return;
    case "other":
      if (!IMAGE_TYPES.has(contentType) && contentType !== PDF_TYPE) {
        throw new Error("Documents must be a PDF or image");
      }
      return;
    default:
      throw new Error("Unsupported document type");
  }
}

function resolveNameFromMetadata(metadata: Record<string, unknown> | undefined): {
  legalName: string;
  firstName: string;
  lastName: string;
} {
  const firstName = typeof metadata?.first_name === "string" ? metadata.first_name.trim() : "";
  const lastName = typeof metadata?.last_name === "string" ? metadata.last_name.trim() : "";
  if (firstName && lastName) {
    return { legalName: `${firstName} ${lastName}`.trim(), firstName, lastName };
  }

  const fullName = typeof metadata?.full_name === "string" ? metadata.full_name.trim() : "";
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    const resolvedFirst = parts[0] ?? "Agent";
    const resolvedLast = parts.slice(1).join(" ") || resolvedFirst;
    return { legalName: fullName, firstName: resolvedFirst, lastName: resolvedLast };
  }

  return { legalName: "Agent Profile", firstName: "Agent", lastName: "Profile" };
}

interface AgentContext {
  userId: string;
  targetUser: User;
  names: { legalName: string; firstName: string; lastName: string };
  profile: Record<string, unknown> | null;
}

async function loadAgentContext(
  adminClient: SupabaseClient,
  userId: string,
): Promise<AgentContext> {
  const { data: targetUserData, error: targetUserError } = await adminClient.auth.admin.getUserById(userId);
  if (targetUserError || !targetUserData.user) {
    throw new Error("User not found");
  }

  const { data: profile } = await adminClient
    .from("portal_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const metadata = targetUserData.user.user_metadata as Record<string, unknown> | undefined;
  const namesFromProfile = profile?.first_name && profile?.last_name
    ? {
        legalName: `${profile.first_name} ${profile.last_name}`.trim(),
        firstName: String(profile.first_name),
        lastName: String(profile.last_name),
      }
    : resolveNameFromMetadata(metadata);

  return {
    userId,
    targetUser: targetUserData.user,
    names: namesFromProfile,
    profile: profile as Record<string, unknown> | null,
  };
}

async function uploadToBucket(
  adminClient: SupabaseClient,
  bucket: string,
  path: string,
  file: File,
  contentType: string,
): Promise<void> {
  const { error } = await adminClient.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: true });

  if (error) {
    throw new Error(error.message);
  }
}

async function clearResignFlag(
  adminClient: SupabaseClient,
  context: AgentContext,
  documentType: AdminProfileDocumentType,
): Promise<void> {
  const flag = RESIGN_FLAGS[documentType];
  if (!flag) return;

  const metadata = context.targetUser.user_metadata as Record<string, unknown> | undefined;
  if (!metadata?.[flag]) return;

  const nextMetadata = { ...metadata };
  delete nextMetadata[flag];

  const { error } = await adminClient.auth.admin.updateUserById(context.userId, {
    user_metadata: nextMetadata,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertPortalProfile(
  adminClient: SupabaseClient,
  context: AgentContext,
  columns: Record<string, unknown>,
): Promise<void> {
  const { error } = await adminClient
    .from("portal_profiles")
    .upsert({
      user_id: context.userId,
      first_name: context.names.firstName,
      last_name: context.names.lastName,
      ...columns,
    }, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message);
  }
}

function profileAddress(context: AgentContext): {
  line1: string;
  city: string;
  state: string;
  zip: string;
} {
  const profile = context.profile;
  return {
    line1: typeof profile?.address_line1 === "string" && profile.address_line1.trim()
      ? profile.address_line1.trim()
      : "On file with PNCL",
    city: typeof profile?.address_city === "string" && profile.address_city.trim()
      ? profile.address_city.trim()
      : "—",
    state: typeof profile?.address_state === "string" && profile.address_state.trim()
      ? profile.address_state.trim()
      : "AZ",
    zip: typeof profile?.address_zip === "string" && profile.address_zip.trim()
      ? profile.address_zip.trim()
      : "00000",
  };
}

export interface AdminProfileDocumentUploadResult {
  documentType: AdminProfileDocumentType;
  path: string;
  fileName: string;
  label?: string;
}

export async function uploadAdminProfileDocument(
  adminClient: SupabaseClient,
  input: {
    userId: string;
    documentType: AdminProfileDocumentType;
    file: File;
    label?: string;
  },
): Promise<AdminProfileDocumentUploadResult> {
  const contentType = input.file.type || "application/octet-stream";
  validateAdminProfileDocumentFile(input.documentType, contentType);

  const context = await loadAgentContext(adminClient, input.userId);
  const extension = extensionForType(contentType);
  const now = new Date().toISOString();
  const placeholderEncrypted = await encryptTemporaryPassword("admin-upload");

  switch (input.documentType) {
    case "drivers_license": {
      const path = getPortalDriversLicensePath(input.userId, extension);
      await uploadToBucket(adminClient, PORTAL_PROFILE_DOCUMENTS_BUCKET, path, input.file, contentType);
      await upsertPortalProfile(adminClient, context, { drivers_license_path: path });
      return { documentType: input.documentType, path, fileName: input.file.name };
    }
    case "eo_certificate": {
      const path = getPortalEoCertificatePath(input.userId, extension);
      await uploadToBucket(adminClient, PORTAL_PROFILE_DOCUMENTS_BUCKET, path, input.file, contentType);
      await upsertPortalProfile(adminClient, context, { eo_certificate_path: path });
      return { documentType: input.documentType, path, fileName: input.file.name };
    }
    case "profile_photo": {
      const path = `${input.userId}/avatar.${extension}`;
      await uploadToBucket(adminClient, PORTAL_PROFILE_PHOTOS_BUCKET, path, input.file, contentType);
      await upsertPortalProfile(adminClient, context, { profile_photo_path: path });
      return { documentType: input.documentType, path, fileName: input.file.name };
    }
    case "w9": {
      const path = getW9PdfPath(input.userId);
      const address = profileAddress(context);
      await uploadToBucket(adminClient, PORTAL_PROFILE_DOCUMENTS_BUCKET, path, input.file, contentType);
      const { error } = await adminClient.from("portal_w9_forms").upsert({
        user_id: input.userId,
        legal_name: context.names.legalName,
        business_name: null,
        tax_classification: "Individual/sole proprietor or single-member LLC",
        address_line1: address.line1,
        address_line2: null,
        city: address.city,
        state: address.state,
        zip: address.zip,
        tin_type: "ssn",
        tin_encrypted: placeholderEncrypted,
        signature_name: context.names.legalName,
        signed_at: now,
        pdf_path: path,
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await clearResignFlag(adminClient, context, input.documentType);
      return { documentType: input.documentType, path, fileName: input.file.name };
    }
    case "direct_deposit": {
      const path = getDirectDepositPdfPath(input.userId);
      const address = profileAddress(context);
      await uploadToBucket(adminClient, PORTAL_PROFILE_DOCUMENTS_BUCKET, path, input.file, contentType);
      const { error } = await adminClient.from("portal_direct_deposit_forms").upsert({
        user_id: input.userId,
        legal_name: context.names.legalName,
        address_line1: address.line1,
        city: address.city,
        state: address.state,
        zip: address.zip,
        account_type: "checking",
        account_number_encrypted: placeholderEncrypted,
        routing_number_encrypted: placeholderEncrypted,
        signature_name: context.names.legalName,
        signed_at: now,
        pdf_path: path,
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await clearResignFlag(adminClient, context, input.documentType);
      return { documentType: input.documentType, path, fileName: input.file.name };
    }
    case "ica": {
      const path = getPortalIcaPdfPath(input.userId);
      const personalEmail = context.targetUser.email
        ?? (typeof context.targetUser.user_metadata?.personal_email === "string"
          ? context.targetUser.user_metadata.personal_email
          : "");
      await uploadToBucket(adminClient, PORTAL_PROFILE_DOCUMENTS_BUCKET, path, input.file, contentType);
      const { error } = await adminClient.from("portal_ica_signatures").upsert({
        user_id: input.userId,
        legal_name: context.names.legalName,
        personal_email: personalEmail || "admin-upload@thepncl.com",
        signature_name: context.names.legalName,
        agreement_accepted: true,
        counsel_acknowledged: true,
        signed_at: now,
        pdf_path: path,
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await clearResignFlag(adminClient, context, input.documentType);
      return { documentType: input.documentType, path, fileName: input.file.name };
    }
    case "other": {
      const trimmedLabel = input.label?.trim() ?? "";
      if (!trimmedLabel) {
        throw new Error("A document label is required for other uploads");
      }
      const path = `${input.userId}/documents/${crypto.randomUUID()}.${extension}`;
      await uploadToBucket(adminClient, PORTAL_PROFILE_DOCUMENTS_BUCKET, path, input.file, contentType);
      const { error } = await adminClient.from("portal_profile_documents").insert({
        user_id: input.userId,
        label: trimmedLabel,
        file_path: path,
        mime_type: contentType,
        size_bytes: input.file.size,
      });
      if (error) throw new Error(error.message);
      return {
        documentType: input.documentType,
        path,
        fileName: input.file.name,
        label: trimmedLabel,
      };
    }
    default:
      throw new Error("Unsupported document type");
  }
}
