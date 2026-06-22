export type PortalIncentiveType = "image" | "video";

export interface PortalIncentiveRecord {
  id: string;
  slug: string;
  title: string;
  type: PortalIncentiveType;
  src: string;
  poster: string | null;
  href: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertIncentivePayload {
  id?: string;
  slug?: string;
  title: string;
  type: PortalIncentiveType;
  src: string;
  poster?: string | null;
  href?: string | null;
  published?: boolean;
  sortOrder?: number;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "incentive";
}

function optionalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateUpsertIncentivePayload(body: unknown): UpsertIncentivePayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) {
    throw new Error("Title is required");
  }

  const type = data.type;
  if (type !== "image" && type !== "video") {
    throw new Error("Type must be image or video");
  }

  const src = typeof data.src === "string" ? data.src.trim() : "";
  if (!src) {
    throw new Error("Media URL is required");
  }

  const poster = optionalUrl(data.poster);
  if (type === "video" && !poster) {
    throw new Error("Poster URL is required for videos");
  }

  const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : undefined;
  const slugInput = typeof data.slug === "string" ? data.slug.trim() : "";
  const slug = slugInput || slugify(title);
  const href = optionalUrl(data.href);
  const published = typeof data.published === "boolean" ? data.published : true;
  const sortOrder = typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
    ? Math.max(0, Math.floor(data.sortOrder))
    : undefined;

  return {
    id,
    slug,
    title,
    type,
    src,
    poster: type === "video" ? poster : null,
    href,
    published,
    sortOrder,
  };
}

export function mapIncentiveRecord(row: PortalIncentiveRecord) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    src: row.src,
    poster: row.poster,
    href: row.href,
    sortOrder: row.sort_order,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
