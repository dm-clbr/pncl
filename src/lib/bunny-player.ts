export interface BunnyPlayer {
  on(event: string, callback: (value?: unknown) => void): void;
  off(event: string): void;
  getDuration(callback: (duration: number) => void): void;
  setCurrentTime(seconds: number): void;
  pause(): void;
}

export type BunnyPlayerConstructor = new (iframe: HTMLIFrameElement) => BunnyPlayer;
declare global {
  interface Window { playerjs?: { Player: BunnyPlayerConstructor } }
}

let loadingPlayer: Promise<BunnyPlayerConstructor> | null = null;

/** Load Bunny's official Player.js control API before mounting its iframe. */
export function loadBunnyPlayer(): Promise<BunnyPlayerConstructor> {
  if (window.playerjs?.Player) return Promise.resolve(window.playerjs.Player);
  if (loadingPlayer) return loadingPlayer;
  loadingPlayer = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js";
    script.async = true;
    const timeout = window.setTimeout(() => {
      loadingPlayer = null;
      script.remove();
      reject(new Error("Video playback tracking could not load."));
    }, 15_000);
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.playerjs?.Player) resolve(window.playerjs.Player);
      else {
        loadingPlayer = null;
        reject(new Error("Video playback tracking is unavailable."));
      }
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      loadingPlayer = null;
      script.remove();
      reject(new Error("Video playback tracking could not load."));
    };
    document.head.appendChild(script);
  });
  return loadingPlayer;
}

export function getBunnyVideoEmbedUrl(href: string): string | null {
  const match = href.match(/^https:\/\/(?:player\.mediadelivery\.net\/(?:play|embed)|iframe\.mediadelivery\.net\/embed)\/(\d+)\/([\w-]+)/);
  return match ? `https://iframe.mediadelivery.net/embed/${match[1]}/${match[2]}` : null;
}

/** Credit continuous playback, rejecting jumps past the watched frontier. */
export class BunnyWatchTracker {
  watched = 0;
  private position = 0;
  private lastUpdate = 0;
  private playing = false;

  resume(seconds: number) {
    this.watched = seconds;
    this.position = seconds;
  }

  setPlaying(playing: boolean, now = performance.now()) {
    this.playing = playing;
    this.lastUpdate = now;
  }

  observe(seconds: number, now = performance.now()): number | null {
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    const delta = seconds - this.position;
    const maxAdvance = Math.max(1, (now - this.lastUpdate) / 1000 * 2 + 0.5);
    this.lastUpdate = now;
    if (seconds > this.watched + 0.5 && (!this.playing || delta > maxAdvance)) {
      this.position = this.watched;
      return this.watched;
    }
    if (this.playing && delta >= 0 && delta <= maxAdvance && this.position <= this.watched + 0.5) {
      this.watched = Math.max(this.watched, seconds);
    }
    this.position = seconds;
    return null;
  }
}
