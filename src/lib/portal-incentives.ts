import { getSupabaseClient } from "@/lib/supabase";

export interface PortalIncentiveImage {
  id: string;
  title: string;
  type: "image";
  src: string;
  href?: string;
}

export interface PortalIncentiveVideo {
  id: string;
  title: string;
  type: "video";
  src: string;
  poster: string;
  href?: string;
}

export type PortalIncentive = PortalIncentiveImage | PortalIncentiveVideo;

export interface AdminIncentive extends PortalIncentive {
  slug: string;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertIncentiveInput {
  id?: string;
  slug?: string;
  title: string;
  type: "image" | "video";
  src: string;
  poster?: string | null;
  href?: string | null;
  published?: boolean;
  sortOrder?: number;
}

interface IncentiveRow {
  id: string;
  slug: string;
  title: string;
  type: "image" | "video";
  src: string;
  poster: string | null;
  href: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_PORTAL_INCENTIVES: PortalIncentive[] = [
  {
    id: "archetype-v4",
    title: "Archetype Poster",
    type: "image",
    src: "/ARCHETYPE POSTER V4.png",
  },
  {
    id: "archetype-v3",
    title: "Archetype Poster V3",
    type: "image",
    src: "/ARCHETYPE POSTER V3.png",
  },
  {
    id: "pillar-001",
    title: "Pillar 01",
    type: "image",
    src: "/001.png",
  },
  {
    id: "pillar-002",
    title: "Pillar 02",
    type: "image",
    src: "/002.png",
  },
  {
    id: "pillar-003",
    title: "Pillar 03",
    type: "image",
    src: "/003.png",
  },
  {
    id: "pillar-004",
    title: "Pillar 04",
    type: "image",
    src: "/004.png",
  },
  {
    id: "culture",
    title: "PNCL Culture",
    type: "image",
    src: "/pncl culture 1.png",
  },
  {
    id: "agents-video",
    title: "PNCL Agents",
    type: "video",
    src: "https://vz-db1532c9-ef4.b-cdn.net/3b0c4b43-8a73-49c4-8009-c8de3f4007f6/play_720p.mp4",
    poster: "https://vz-db1532c9-ef4.b-cdn.net/3b0c4b43-8a73-49c4-8009-c8de3f4007f6/thumbnail.jpg",
  },
];

function mapPortalIncentive(row: IncentiveRow): PortalIncentive {
  const base = {
    id: row.id,
    title: row.title,
    href: row.href ?? undefined,
  };

  if (row.type === "video") {
    return {
      ...base,
      type: "video",
      src: row.src,
      poster: row.poster ?? "",
    };
  }

  return {
    ...base,
    type: "image",
    src: row.src,
  };
}

export function mapAdminIncentive(row: IncentiveRow): AdminIncentive {
  const incentive = mapPortalIncentive(row);
  return {
    ...incentive,
    slug: row.slug,
    sortOrder: row.sort_order,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchPortalIncentives(): Promise<PortalIncentive[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_incentives")
    .select("id, slug, title, type, src, poster, href, sort_order, published, created_at, updated_at")
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  if (!data?.length) {
    return DEFAULT_PORTAL_INCENTIVES;
  }

  return (data as IncentiveRow[]).map(mapPortalIncentive);
}
