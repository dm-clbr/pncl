import { useEffect, useRef, useState } from "react";
import { BunnyWatchTracker, loadBunnyPlayer, type BunnyPlayerConstructor } from "@/lib/bunny-player";
import { isVideoPlaybackComplete } from "@/lib/video-playback";

export default function PortalBunnyTutorialPlayer({
  title, embedUrl, progressKey, onProgress, onFinished, onError,
}: {
  title: string;
  embedUrl: string;
  progressKey: string;
  onProgress: (watched: number, duration: number) => void;
  onFinished: () => void;
  onError: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onProgress, onFinished, onError });
  callbacks.current = { onProgress, onFinished, onError };
  const [Player, setPlayer] = useState<BunnyPlayerConstructor | null>(null);

  useEffect(() => {
    let disposed = false;
    loadBunnyPlayer().then((constructor) => {
      if (!disposed) setPlayer(() => constructor);
    }).catch(() => { if (!disposed) callbacks.current.onError(); });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!Player || !frame.current) return;
    const player = new Player(frame.current);
    const tracker = new BunnyWatchTracker();
    let duration = 0;
    let disposed = false;
    let finished = false;
    const readyTimeout = window.setTimeout(() => callbacks.current.onError(), 20_000);
    player.on("ready", () => {
      window.clearTimeout(readyTimeout);
      player.getDuration((length) => {
        if (disposed || !Number.isFinite(length) || length <= 0) return;
        duration = length;
        try {
          const saved = Number(sessionStorage.getItem(progressKey));
          if (Number.isFinite(saved) && saved > 0 && saved <= duration) {
            tracker.resume(saved);
            player.setCurrentTime(Math.min(saved, Math.max(0, duration - 0.5)));
          }
        } catch { /* Browser storage is optional. */ }
        callbacks.current.onProgress(tracker.watched, duration);
      });
    });
    player.on("play", () => tracker.setPlaying(true));
    player.on("pause", () => tracker.setPlaying(false));
    player.on("timeupdate", (value) => {
      if (disposed) return;
      let data: { seconds?: unknown; duration?: unknown };
      try { data = typeof value === "string" ? JSON.parse(value) : value as typeof data; }
      catch { return; }
      if (!data || typeof data.seconds !== "number") return;
      if (typeof data.duration === "number" && Number.isFinite(data.duration) && data.duration > 0) duration = data.duration;
      const seekBack = tracker.observe(data.seconds);
      if (seekBack !== null) player.setCurrentTime(seekBack);
      if (duration > 0) callbacks.current.onProgress(tracker.watched, duration);
    });
    player.on("ended", () => {
      if (!disposed && !finished && isVideoPlaybackComplete(tracker.watched, duration)) {
        finished = true;
        callbacks.current.onFinished();
      }
    });
    player.on("error", () => { if (!disposed) callbacks.current.onError(); });
    return () => {
      disposed = true;
      window.clearTimeout(readyTimeout);
      for (const event of ["ready", "play", "pause", "timeupdate", "ended", "error"]) player.off(event);
    };
  }, [Player, embedUrl, progressKey]);

  if (!Player) return <div className="portal-video-status" role="status">Loading video…</div>;
  return <iframe ref={frame}
    src={`${embedUrl}?autoplay=false&loop=false&rememberPosition=false&rememberSettings=false&showSpeed=false&playsinline=true`}
    title={title} allow="autoplay; encrypted-media; fullscreen" allowFullScreen
    referrerPolicy="strict-origin-when-cross-origin" />;
}
