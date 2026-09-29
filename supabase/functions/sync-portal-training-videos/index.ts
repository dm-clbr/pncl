import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  parseYouTubeTrainingFeed,
  PNCL_YOUTUBE_CHANNEL_ID,
  youtubeTrainingSlug,
} from "../_shared/youtubeTraining.ts";

const CHANNEL_FEED_URL =
  `https://www.youtube.com/feeds/videos.xml?channel_id=${PNCL_YOUTUBE_CHANNEL_ID}`;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { user, adminClient } = await requireGenesisAdminOrAdmin(req);
    const feedResponse = await fetch(CHANNEL_FEED_URL, {
      headers: { Accept: "application/atom+xml, application/xml;q=0.9" },
    });
    if (!feedResponse.ok) {
      throw new Error(`YouTube feed returned ${feedResponse.status}`);
    }

    const videos = parseYouTubeTrainingFeed(await feedResponse.text());
    if (videos.length === 0) {
      throw new Error("YouTube feed did not contain any valid PNCL videos");
    }

    const { data: existingRows, error: existingError } = await adminClient
      .from("portal_disclosures")
      .select("youtube_video_id, sort_order");
    if (existingError) throw new Error(existingError.message);

    const existingVideoIds = new Set(
      (existingRows ?? [])
        .map((row) => row.youtube_video_id as string | null)
        .filter((videoId): videoId is string => Boolean(videoId)),
    );
    const nextSortOrder = Math.max(
      0,
      ...(existingRows ?? []).map((row) => Number(row.sort_order) || 0),
    ) + 1;
    const newVideos = videos
      .filter((video) => !existingVideoIds.has(video.videoId))
      .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));

    let added = 0;
    if (newVideos.length > 0) {
      const rows = newVideos.map((video, index) => ({
        slug: youtubeTrainingSlug(video.videoId),
        title: video.title,
        description: video.description || "Published on the PNCL YouTube channel.",
        video_url: video.url,
        youtube_video_id: video.videoId,
        youtube_published_at: video.publishedAt,
        sort_order: nextSortOrder + index,
        published: true,
      }));
      const { data: insertedRows, error: insertError } = await adminClient
        .from("portal_disclosures")
        .upsert(rows, { onConflict: "youtube_video_id", ignoreDuplicates: true })
        .select("id");
      if (insertError) throw new Error(insertError.message);
      added = insertedRows?.length ?? 0;
    }

    logOnboarding("portal_training_videos_synced", {
      userId: user.id,
      channelId: PNCL_YOUTUBE_CHANNEL_ID,
      found: videos.length,
      added,
    });
    return jsonResponse({
      synced: true,
      channelId: PNCL_YOUTUBE_CHANNEL_ID,
      found: videos.length,
      added,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to refresh training videos";
    logOnboarding("portal_training_videos_sync_failed", { error: message }, "error");
    return errorResponse("Unable to refresh training videos", 502, "sync_failed");
  }
});
