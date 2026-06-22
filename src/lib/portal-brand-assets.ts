import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

export interface PortalBrandAsset {
  id: string;
  title: string;
  description: string | null;
  url: string;
  fileName: string;
  contentType: string;
}

export function isImageAsset(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export function assetTypeLabel(contentType: string): string {
  if (contentType === "application/pdf") return "PDF";
  if (contentType.includes("zip")) return "ZIP";
  if (contentType.startsWith("image/")) return "Image";
  return "File";
}

export async function fetchPortalBrandAssets(accessToken: string): Promise<PortalBrandAsset[]> {
  if (!isSupabaseAuthConfigured()) {
    return [];
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/list-portal-brand-assets`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to load brand assets");
  }

  return (data.assets ?? []) as PortalBrandAsset[];
}
