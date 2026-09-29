import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseYouTubeTrainingFeed,
  PNCL_YOUTUBE_CHANNEL_ID,
  youtubeTrainingSlug,
} from "../../supabase/functions/_shared/youtubeTraining";

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <yt:videoId>YLSz1TYXx3I</yt:videoId>
    <yt:channelId>${PNCL_YOUTUBE_CHANNEL_ID}</yt:channelId>
    <title>DAY 2 NEW AGENT ACADEMY | PNCL</title>
    <published>2026-09-22T22:43:17+00:00</published>
    <media:description>Scripts &amp; rebuttals</media:description>
  </entry>
  <entry>
    <yt:videoId>xYQxz69zUVY</yt:videoId>
    <yt:channelId>UCnot-the-pncl-channel</yt:channelId>
    <title>Wrong channel</title>
    <published>2026-09-22T22:39:56+00:00</published>
  </entry>
</feed>`;

describe("YouTube training channel sync", () => {
  it("accepts valid PNCL channel entries and decodes their metadata", () => {
    expect(parseYouTubeTrainingFeed(feed)).toEqual([
      {
        videoId: "YLSz1TYXx3I",
        title: "DAY 2 NEW AGENT ACADEMY | PNCL",
        description: "Scripts & rebuttals",
        publishedAt: "2026-09-22T22:43:17.000Z",
        url: "https://www.youtube.com/watch?v=YLSz1TYXx3I",
      },
    ]);
  });

  it("creates a stable database slug from the video id", () => {
    expect(youtubeTrainingSlug("YLSz1TYXx3I")).toBe("youtube-ylsz1tyxx3i");
  });

  it("adds unique YouTube identity columns for duplicate-safe refreshes", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260922224759_youtube_training_channel_sync.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(/add column if not exists youtube_video_id text/i);
    expect(migration).toMatch(/unique \(youtube_video_id\)/i);
    expect(migration).toMatch(/update public\.portal_disclosures[\s\S]*regexp_match/i);
  });

  it("authenticates portal users and only fetches the fixed PNCL channel", () => {
    const functionSource = readFileSync(
      resolve(
        process.cwd(),
        "supabase/functions/sync-portal-training-videos/index.ts",
      ),
      "utf8",
    );

    expect(functionSource).toMatch(/requireGenesisAdminOrAdmin\(req\)/);
    expect(functionSource).toMatch(/channel_id=\$\{PNCL_YOUTUBE_CHANNEL_ID\}/);
    expect(functionSource).toMatch(/onConflict: "youtube_video_id", ignoreDuplicates: true/);
    expect(functionSource).not.toMatch(/req\.json\(/);
  });
});
