export interface PortalDashboardFileRecord {
  id: string;
  section_id: string;
  title: string;
  description: string | null;
  url: string;
  file_name: string;
  content_type: string;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertDashboardFilePayload {
  id?: string;
  sectionId: string;
  title: string;
  description?: string | null;
  url: string;
  fileName: string;
  contentType: string;
  published?: boolean;
  sortOrder?: number;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeSectionId(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!slug) {
    throw new Error("Section id must contain letters or numbers");
  }
  return slug;
}

export function validateUpsertDashboardFilePayload(body: unknown): UpsertDashboardFilePayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const sectionId = normalizeSectionId(typeof data.sectionId === "string" ? data.sectionId : "");
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const url = typeof data.url === "string" ? data.url.trim() : "";
  const fileName = typeof data.fileName === "string" ? data.fileName.trim() : "";
  const contentType = typeof data.contentType === "string" ? data.contentType.trim() : "";

  if (!title) throw new Error("File title is required");
  if (!url) throw new Error("File URL is required");
  if (!fileName) throw new Error("File name is required");
  if (!contentType) throw new Error("Content type is required");

  const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : undefined;
  const description = optionalText(data.description);
  const published = typeof data.published === "boolean" ? data.published : true;
  const sortOrder = typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
    ? Math.max(0, Math.floor(data.sortOrder))
    : undefined;

  return { id, sectionId, title, description, url, fileName, contentType, published, sortOrder };
}

export function mapDashboardFileRecord(row: PortalDashboardFileRecord) {
  return {
    id: row.id,
    sectionId: row.section_id,
    title: row.title,
    description: row.description,
    url: row.url,
    fileName: row.file_name,
    contentType: row.content_type,
    sortOrder: row.sort_order,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
