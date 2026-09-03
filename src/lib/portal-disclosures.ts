import { getSupabaseClient } from "@/lib/supabase";

export interface PortalDisclosure {
  id: string;
  slug: string;
  title: string;
  description: string;
  video_url: string | null;
  sort_order: number;
  content_version: number;
}

export function hasDisclosureVideo(disclosure: PortalDisclosure): boolean {
  return Boolean(disclosure.video_url?.trim());
}

export function getDisclosureAcknowledgmentKey(
  disclosure: Pick<PortalDisclosure, "id" | "content_version">,
): string {
  return `${disclosure.id}:${disclosure.content_version}`;
}

export function isDisclosureCompleted(
  acknowledgmentKeys: Set<string>,
  disclosure: PortalDisclosure,
): boolean {
  return hasDisclosureVideo(disclosure)
    && acknowledgmentKeys.has(getDisclosureAcknowledgmentKey(disclosure));
}

export async function fetchPortalDisclosures(): Promise<PortalDisclosure[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_disclosures")
    .select("id, slug, title, description, video_url, sort_order, content_version")
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PortalDisclosure[];
}

export async function fetchAcknowledgedDisclosureKeys(userId: string): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_disclosure_acknowledgments")
    .select("disclosure_id, content_version")
    .eq("user_id", userId);

  if (error) throw error;
  return new Set(
    ((data ?? []) as { disclosure_id: string; content_version: number }[])
      .map((row) => `${row.disclosure_id}:${row.content_version}`),
  );
}

export async function acknowledgeDisclosure(
  userId: string,
  disclosureId: string,
  contentVersion: number,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("portal_disclosure_acknowledgments")
    .insert({
      user_id: userId,
      disclosure_id: disclosureId,
      content_version: contentVersion,
    });

  // Re-acknowledging (unique violation) is fine.
  if (error && error.code !== "23505") throw error;
}

/** Converts common video URLs to an embeddable iframe src; null means use <video>. */
export function toEmbedUrl(videoUrl: string): string | null {
  try {
    const url = new URL(videoUrl);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const pathId = url.pathname.startsWith("/embed/")
        ? url.pathname.split("/")[2]
        : null;
      const id = pathId ?? url.searchParams.get("v");
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        return `https://www.youtube-nocookie.com/embed/${id}`;
      }
    }
    if (host === "youtu.be") {
      const id = url.pathname.split("/")[1];
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        return `https://www.youtube-nocookie.com/embed/${id}`;
      }
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
