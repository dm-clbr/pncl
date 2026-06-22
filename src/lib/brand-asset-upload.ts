import { getSupabaseConfig } from "@/lib/supabase";

export async function uploadBrandAsset(
  accessToken: string,
  file: File | Blob,
  filename: string,
): Promise<{ url: string; path: string; contentType: string; fileName: string }> {
  const { url, anonKey } = getSupabaseConfig();
  const formData = new FormData();
  formData.append("file", file, filename);

  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/admin-upload-brand-asset`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to upload brand asset");
  }

  return data as { url: string; path: string; contentType: string; fileName: string };
}
