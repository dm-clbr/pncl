import { getSupabaseClient } from "@/lib/supabase";
import { PROFILE_DOCUMENTS_BUCKET } from "@/lib/portal-profile";

export const MAX_PROFILE_DOCUMENT_BYTES = 5 * 1024 * 1024;

const PROFILE_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface PortalProfileDocument {
  id: string;
  user_id: string;
  label: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export async function fetchProfileDocuments(userId: string): Promise<PortalProfileDocument[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_profile_documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PortalProfileDocument[];
}

export async function uploadProfileDocument(
  userId: string,
  label: string,
  file: File,
): Promise<PortalProfileDocument> {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    throw new Error("Give the document a short name so admins know what it is.");
  }

  const extension = PROFILE_DOCUMENT_TYPES[file.type];
  if (!extension) {
    throw new Error("Documents must be a PDF, JPG, PNG, or WebP file.");
  }
  if (file.size > MAX_PROFILE_DOCUMENT_BYTES) {
    throw new Error("Documents must be 5 MB or smaller.");
  }

  const supabase = getSupabaseClient();
  const path = `${userId}/documents/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("portal_profile_documents")
    .insert({
      user_id: userId,
      label: trimmedLabel,
      file_path: path,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(PROFILE_DOCUMENTS_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }

  return data as PortalProfileDocument;
}

export async function deleteProfileDocument(document: PortalProfileDocument): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("portal_profile_documents")
    .delete()
    .eq("id", document.id);

  if (error) throw error;

  await supabase.storage
    .from(PROFILE_DOCUMENTS_BUCKET)
    .remove([document.file_path])
    .catch(() => undefined);
}

export async function getProfileDocumentUrl(path: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(PROFILE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
