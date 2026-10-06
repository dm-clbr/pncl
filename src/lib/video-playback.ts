/** The furthest point continuously played, starting at the saved position. */
export function getWatchedVideoTime(played: TimeRanges, previous = 0): number {
  let watched = previous;
  for (let index = 0; index < played.length; index += 1) {
    if (played.start(index) > watched + 0.5) break;
    watched = Math.max(watched, played.end(index));
  }
  return watched;
}

export function isVideoPlaybackComplete(watched: number, duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && watched >= duration - 0.5;
}
