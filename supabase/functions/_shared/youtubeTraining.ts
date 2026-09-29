export const PNCL_YOUTUBE_CHANNEL_ID = "UCrfJuBtosbhhTNiA7lLW8og";

export interface YouTubeTrainingVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
}

function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function readTag(block: string, tag: string): string | null {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(
    new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, "i"),
  );
  return match ? decodeXml(match[1]) : null;
}

export function parseYouTubeTrainingFeed(xml: string): YouTubeTrainingVideo[] {
  const entries = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? [];
  const videos: YouTubeTrainingVideo[] = [];

  for (const entry of entries) {
    const videoId = readTag(entry, "yt:videoId");
    const channelId = readTag(entry, "yt:channelId");
    const title = readTag(entry, "title");
    const publishedAt = readTag(entry, "published");
    const description = readTag(entry, "media:description") ?? "";

    if (
      !videoId ||
      !/^[A-Za-z0-9_-]{11}$/.test(videoId) ||
      channelId !== PNCL_YOUTUBE_CHANNEL_ID ||
      !title ||
      !publishedAt ||
      Number.isNaN(Date.parse(publishedAt))
    ) {
      continue;
    }

    videos.push({
      videoId,
      title: title.slice(0, 300),
      description: description.slice(0, 5_000),
      publishedAt: new Date(publishedAt).toISOString(),
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  return videos;
}

export function youtubeTrainingSlug(videoId: string): string {
  return `youtube-${videoId.toLowerCase()}`;
}
