import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

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

interface PortalIncentiveResponse {
  id: string;
  title: string;
  type: "image" | "video";
  src: string;
  poster: string | null;
  href: string | null;
}

function mapPortalIncentive(row: IncentiveRow | PortalIncentiveResponse): PortalIncentive {
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

export async function fetchPortalIncentives(accessToken: string): Promise<PortalIncentive[]> {
  if (!isSupabaseAuthConfigured()) {
    return [];
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/list-portal-incentives`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to load incentives");
  }

  const incentives = (data.incentives ?? []) as PortalIncentiveResponse[];
  return incentives.map(mapPortalIncentive);
}
