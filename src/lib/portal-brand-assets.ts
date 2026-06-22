import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

export type BrandAssetType = "file" | "color";

export interface PortalBrandAsset {
  id: string;
  title: string;
  description: string | null;
  assetType: BrandAssetType;
  url: string;
  fileName: string;
  contentType: string;
  hexColor: string | null;
}

export function isColorAsset(asset: Pick<PortalBrandAsset, "assetType">): boolean {
  return asset.assetType === "color";
}

export function isImageAsset(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const hex = trimmed.slice(1);
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase();
  }
  return null;
}

export function assetTypeLabel(
  contentType: string,
  assetType: BrandAssetType = "file",
): string {
  if (assetType === "color") return "Color";
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

export async function copyHexColor(hexColor: string): Promise<void> {
  await navigator.clipboard.writeText(hexColor);
}
