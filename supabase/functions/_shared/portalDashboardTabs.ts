import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface PortalDashboardSectionRecord {
  id: string;
  title: string;
  sort_order: number;
  published: boolean;
  section_type: string;
  created_at: string;
  updated_at: string;
}

export interface PortalDashboardLinkRecord {
  id: string;
  section_id: string;
  title: string;
  description: string | null;
  href: string;
  external: boolean;
  icon: string;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertDashboardSectionPayload {
  id: string;
  title: string;
  published?: boolean;
  sortOrder?: number;
  sectionType?: "links" | "incentives" | "brand_assets";
}

export interface UpsertDashboardLinkPayload {
  id?: string;
  sectionId: string;
  title: string;
  description?: string | null;
  href: string;
  external?: boolean;
  icon?: string;
  published?: boolean;
  sortOrder?: number;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function normalizeSectionId(value: string): string {
  const slug = slugify(value);
  if (!slug) {
    throw new Error("Tab id must contain letters or numbers");
  }
  return slug;
}

export function validateUpsertDashboardSectionPayload(body: unknown): UpsertDashboardSectionPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const id = normalizeSectionId(typeof data.id === "string" ? data.id : "");
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) {
    throw new Error("Tab title is required");
  }

  const published = typeof data.published === "boolean" ? data.published : true;
  const sortOrder = typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
    ? Math.max(0, Math.floor(data.sortOrder))
    : undefined;
  const sectionTypeRaw = typeof data.sectionType === "string" ? data.sectionType : "links";
  const sectionType = sectionTypeRaw === "incentives" || sectionTypeRaw === "brand_assets"
    ? sectionTypeRaw
    : "links";

  return { id, title, published, sortOrder, sectionType };
}

export function validateUpsertDashboardLinkPayload(body: unknown): UpsertDashboardLinkPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const sectionId = normalizeSectionId(typeof data.sectionId === "string" ? data.sectionId : "");
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const href = typeof data.href === "string" ? data.href.trim() : "";

  if (!title) throw new Error("Link title is required");
  if (!href) throw new Error("Link URL is required");

  const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : undefined;
  const description = optionalText(data.description);
  const external = typeof data.external === "boolean" ? data.external : false;
  const icon = optionalText(data.icon) ?? "Link2";
  const published = typeof data.published === "boolean" ? data.published : true;
  const sortOrder = typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
    ? Math.max(0, Math.floor(data.sortOrder))
    : undefined;

  return { id, sectionId, title, description, href, external, icon, published, sortOrder };
}

export function mapDashboardLinkRecord(row: PortalDashboardLinkRecord) {
  return {
    id: row.id,
    sectionId: row.section_id,
    title: row.title,
    description: row.description,
    href: row.href,
    external: row.external,
    icon: row.icon,
    sortOrder: row.sort_order,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDashboardSectionRecord(
  row: PortalDashboardSectionRecord,
  links: ReturnType<typeof mapDashboardLinkRecord>[],
) {
  return {
    id: row.id,
    title: row.title,
    sortOrder: row.sort_order,
    published: row.published,
    sectionType: row.section_type === "incentives" || row.section_type === "brand_assets"
      ? row.section_type
      : "links",
    links,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadDashboardTabs(
  adminClient: SupabaseClient,
  publishedOnly: boolean,
) {
  let sectionsQuery = adminClient
    .from("portal_dashboard_sections")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (publishedOnly) {
    sectionsQuery = sectionsQuery.eq("published", true);
  }

  let linksQuery = adminClient
    .from("portal_dashboard_links")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (publishedOnly) {
    linksQuery = linksQuery.eq("published", true);
  }

  const [{ data: sectionRows, error: sectionError }, { data: linkRows, error: linkError }] =
    await Promise.all([sectionsQuery, linksQuery]);

  if (sectionError) throw new Error(sectionError.message);
  if (linkError) throw new Error(linkError.message);

  const linksBySection = new Map<string, ReturnType<typeof mapDashboardLinkRecord>[]>();
  for (const row of (linkRows ?? []) as PortalDashboardLinkRecord[]) {
    const mapped = mapDashboardLinkRecord(row);
    const bucket = linksBySection.get(mapped.sectionId) ?? [];
    bucket.push(mapped);
    linksBySection.set(mapped.sectionId, bucket);
  }

  return ((sectionRows ?? []) as PortalDashboardSectionRecord[]).map((row) =>
    mapDashboardSectionRecord(row, linksBySection.get(row.id) ?? [])
  );
}
