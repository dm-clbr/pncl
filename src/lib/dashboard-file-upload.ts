import { getSupabaseConfig } from "@/lib/supabase";

export async function uploadDashboardFile(
  accessToken: string,
  sectionId: string,
  file: File,
): Promise<{ url: string; contentType: string; fileName: string }> {
  const { url } = getSupabaseConfig();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sectionId", sectionId);

  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/admin-upload-dashboard-file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to upload file");
  }

  return {
    url: data.url,
    contentType: data.contentType,
    fileName: data.fileName,
  };
}
