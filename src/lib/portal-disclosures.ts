import { getSupabaseClient } from "@/lib/supabase";

export interface PortalDisclosure {
  id: string;
  slug: string;
  title: string;
  description: string;
  video_url: string | null;
  sort_order: number;
}

export async function fetchPortalDisclosures(): Promise<PortalDisclosure[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_disclosures")
    .select("id, slug, title, description, video_url, sort_order")
    .eq("published", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PortalDisclosure[];
}

export async function fetchAcknowledgedDisclosureIds(userId: string): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_disclosure_acknowledgments")
    .select("disclosure_id")
    .eq("user_id", userId);

  if (error) throw error;
  return new Set(((data ?? []) as { disclosure_id: string }[]).map((row) => row.disclosure_id));
}

export async function acknowledgeDisclosure(userId: string, disclosureId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("portal_disclosure_acknowledgments")
    .insert({ user_id: userId, disclosure_id: disclosureId });

  // Re-acknowledging (unique violation) is fine.
  if (error && error.code !== "23505") throw error;
}

/** Converts common video URLs to an embeddable iframe src; null means use <video>. */
export function toEmbedUrl(videoUrl: string): string | null {
  try {
    const url = new URL(videoUrl);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = url.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (url.pathname.startsWith("/embed/")) return videoUrl;
    }
    if (host === "youtu.be") {
      return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
    }
    if (host === "vimeo.com") {
      return `https://player.vimeo.com/video/${url.pathname.slice(1)}`;
    }
    if (host === "player.vimeo.com" || host === "loom.com" || host === "www.loom.com") {
      return videoUrl.replace("loom.com/share/", "loom.com/embed/");
    }
  } catch {
    return null;
  }
  return null;
}
