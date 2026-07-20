import { getSupabaseConfig } from "@/lib/supabase";

export type AdminProfileDocumentType =
  | "drivers_license"
  | "eo_certificate"
  | "w9"
  | "direct_deposit"
  | "ica"
  | "profile_photo"
  | "other";

export const ADMIN_PROFILE_DOCUMENT_OPTIONS: {
  id: AdminProfileDocumentType;
  label: string;
  accept: string;
  hint: string;
}[] = [
  {
    id: "drivers_license",
    label: "Driver's license",
    accept: "image/jpeg,image/png,image/webp",
    hint: "JPG, PNG, or WebP",
  },
  {
    id: "eo_certificate",
    label: "E&O certificate",
    accept: "application/pdf,image/jpeg,image/png,image/webp",
    hint: "PDF or image",
  },
  {
    id: "w9",
    label: "Form W-9",
    accept: "application/pdf",
    hint: "Signed PDF",
  },
  {
    id: "direct_deposit",
    label: "Direct deposit form",
    accept: "application/pdf",
    hint: "Signed PDF",
  },
  {
    id: "ica",
    label: "Independent Contractor Agreement",
    accept: "application/pdf",
    hint: "Signed PDF",
  },
  {
    id: "profile_photo",
    label: "Profile photo",
    accept: "image/jpeg,image/png,image/webp",
    hint: "JPG, PNG, or WebP",
  },
  {
    id: "other",
    label: "Other document",
    accept: "application/pdf,image/jpeg,image/png,image/webp",
    hint: "PDF or image — add a label",
  },
];

export async function uploadAdminProfileDocument(
  accessToken: string,
  input: {
    userId: string;
    documentType: AdminProfileDocumentType;
    file: File;
    label?: string;
  },
): Promise<{ message: string; path: string; fileName: string; documentType: AdminProfileDocumentType }> {
  const { url, anonKey } = getSupabaseConfig();
  const formData = new FormData();
  formData.append("userId", input.userId);
  formData.append("documentType", input.documentType);
  formData.append("file", input.file, input.file.name);
  if (input.label?.trim()) {
    formData.append("label", input.label.trim());
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/admin-upload-profile-document`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to upload document");
  }

  return data as {
    message: string;
    path: string;
    fileName: string;
    documentType: AdminProfileDocumentType;
  };
}
