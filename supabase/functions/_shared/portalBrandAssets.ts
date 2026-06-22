export type BrandAssetType = "file" | "color";

export interface PortalBrandAssetRecord {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  file_name: string | null;
  content_type: string | null;
  asset_type: BrandAssetType;
  hex_color: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertBrandAssetPayload {
  id?: string;
  title: string;
  description?: string | null;
  assetType?: BrandAssetType;
  url?: string;
  fileName?: string;
  contentType?: string;
  hexColor?: string | null;
  published?: boolean;
  sortOrder?: number;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

export function validateUpsertBrandAssetPayload(body: unknown): UpsertBrandAssetPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) {
    throw new Error("Title is required");
  }

  const assetType = data.assetType === "color" ? "color" : "file";
  const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : undefined;
  const description = optionalText(data.description);
  const published = typeof data.published === "boolean" ? data.published : true;
  const sortOrder = typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
    ? Math.max(0, Math.floor(data.sortOrder))
    : undefined;

  if (assetType === "color") {
    const hexRaw = typeof data.hexColor === "string" ? data.hexColor : "";
    const hexColor = normalizeHexColor(hexRaw);
    if (!hexColor) {
      throw new Error("A valid hex color is required (e.g. #FF5500)");
    }

    return {
      id,
      title,
      description,
      assetType,
      hexColor,
      published,
      sortOrder,
    };
  }

  const url = typeof data.url === "string" ? data.url.trim() : "";
  if (!url) {
    throw new Error("File URL is required");
  }

  const fileName = typeof data.fileName === "string" ? data.fileName.trim() : "";
  if (!fileName) {
    throw new Error("File name is required");
  }

  const contentType = typeof data.contentType === "string" ? data.contentType.trim() : "";
  if (!contentType) {
    throw new Error("Content type is required");
  }

  return {
    id,
    title,
    description,
    assetType,
    url,
    fileName,
    contentType,
    published,
    sortOrder,
  };
}

export function mapBrandAssetRecord(row: PortalBrandAssetRecord) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assetType: row.asset_type ?? "file",
    url: row.url ?? "",
    fileName: row.file_name ?? "",
    contentType: row.content_type ?? "",
    hexColor: row.hex_color,
    sortOrder: row.sort_order,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
