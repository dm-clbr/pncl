import { describe, expect, it } from "vitest";
import {
  getDisclosureAcknowledgmentKey,
  isDisclosureCompleted,
  toEmbedUrl,
  type PortalDisclosure,
} from "@/lib/portal-disclosures";

const moduleRecord: PortalDisclosure = {
  id: "module-1",
  slug: "disclosure_1",
  title: "Day 1: Welcome",
  description: "Training module",
  video_url: "https://www.youtube.com/watch?v=pd2a8WCC8cs",
  sort_order: 1,
  content_version: 2,
};

describe("portal training completion", () => {
  it("ties completion to the module's current content version and video", () => {
    const keys = new Set([getDisclosureAcknowledgmentKey(moduleRecord)]);

    expect(isDisclosureCompleted(keys, moduleRecord)).toBe(true);
    expect(isDisclosureCompleted(keys, { ...moduleRecord, content_version: 3 })).toBe(false);
    expect(isDisclosureCompleted(keys, { ...moduleRecord, video_url: null })).toBe(false);
  });
});

describe("training video embeds", () => {
  it("uses privacy-enhanced YouTube embeds for supported URLs", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=pd2a8WCC8cs")).toBe(
      "https://www.youtube-nocookie.com/embed/pd2a8WCC8cs",
    );
    expect(toEmbedUrl("https://youtu.be/9iQnVo4tibQ")).toBe(
      "https://www.youtube-nocookie.com/embed/9iQnVo4tibQ",
    );
    expect(toEmbedUrl("https://www.youtube.com/embed/MMC9vlQRIrw")).toBe(
      "https://www.youtube-nocookie.com/embed/MMC9vlQRIrw",
    );
  });

  it("rejects malformed YouTube IDs and leaves direct files to the video element", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=too-short")).toBeNull();
    expect(toEmbedUrl("https://media.example.com/module.mp4")).toBeNull();
  });
});
