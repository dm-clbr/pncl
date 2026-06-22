import { getSupabaseConfig } from "@/lib/supabase";

export async function uploadIncentiveMedia(
  accessToken: string,
  file: File | Blob,
  filename: string,
): Promise<{ url: string; path: string }> {
  const { url, anonKey } = getSupabaseConfig();
  const formData = new FormData();
  formData.append("file", file, filename);

  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/admin-upload-incentive-media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to upload media");
  }

  return data as { url: string; path: string };
}
