import { describe, expect, it } from "vitest";
import { getWatchedVideoTime, isVideoPlaybackComplete } from "./video-playback";

function played(ranges: [number, number][]): TimeRanges {
  return { length: ranges.length, start: (i) => ranges[i][0], end: (i) => ranges[i][1] };
}

describe("verified tutorial playback", () => {
  it("counts continuous playback and resumed or replayed sections", () => {
    expect(getWatchedVideoTime(played([[0, 4], [4.1, 8]]))).toBe(8);
    expect(getWatchedVideoTime(played([[3, 12]]), 8)).toBe(12);
    expect(getWatchedVideoTime(played([[0, 3]]), 8)).toBe(8);
  });

  it("does not credit skipping to the end or over an unwatched section", () => {
    expect(getWatchedVideoTime(played([[9, 10]]))).toBe(0);
    expect(getWatchedVideoTime(played([[0, 3], [8, 10]]))).toBe(3);
    expect(isVideoPlaybackComplete(3, 10)).toBe(false);
  });

  it("requires a valid duration and complete playback", () => {
    expect(isVideoPlaybackComplete(10, 10)).toBe(true);
    expect(isVideoPlaybackComplete(9.9, 10)).toBe(true);
    expect(isVideoPlaybackComplete(9, 10)).toBe(false);
    expect(isVideoPlaybackComplete(10, NaN)).toBe(false);
    expect(isVideoPlaybackComplete(10, Infinity)).toBe(false);
    expect(isVideoPlaybackComplete(0, 0)).toBe(false);
  });
});
