import { describe, expect, it } from "vitest";
import { BunnyWatchTracker, getBunnyVideoEmbedUrl } from "./bunny-player";

describe("Bunny walkthrough tracking", () => {
  it("recognizes Bunny share and embed URLs without trusting other hosts", () => {
    for (const url of ["https://player.mediadelivery.net/play/687293/video-id", "https://iframe.mediadelivery.net/embed/687293/video-id", "https://player.mediadelivery.net/embed/687293/video-id"]) {
      expect(getBunnyVideoEmbedUrl(url)).toBe("https://iframe.mediadelivery.net/embed/687293/video-id");
    }
    expect(getBunnyVideoEmbedUrl("https://example.com/embed/687293/video-id")).toBeNull();
  });

  it("credits continuous playback and rejects jumping to the end", () => {
    const tracker = new BunnyWatchTracker();
    tracker.setPlaying(true, 0);
    expect(tracker.observe(1, 1000)).toBeNull();
    expect(tracker.watched).toBe(1);
    expect(tracker.observe(586, 1250)).toBe(1);
    expect(tracker.watched).toBe(1);
    expect(tracker.observe(2, 2000)).toBeNull();
    expect(tracker.watched).toBe(2);
  });

  it("does not credit seeking while paused and preserves resumed/replayed progress", () => {
    const tracker = new BunnyWatchTracker();
    tracker.resume(10);
    expect(tracker.observe(40, 1000)).toBe(10);
    tracker.setPlaying(true, 2000);
    tracker.observe(11, 3000);
    tracker.observe(5, 3250);
    tracker.observe(6, 4250);
    expect(tracker.watched).toBe(11);
    tracker.setPlaying(false, 4500);
    expect(tracker.observe(20, 5000)).toBe(11);
  });
});
