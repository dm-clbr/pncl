import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { getWatchedVideoTime, isVideoPlaybackComplete } from "@/lib/video-playback";
import { getBunnyVideoEmbedUrl } from "@/lib/bunny-player";
import PortalBunnyTutorialPlayer from "@/components/PortalBunnyTutorialPlayer";

export default function PortalTutorialVideoModal({
  title, sourceUrl, progressKey, completing, onComplete, onClose,
}: {
  title: string;
  sourceUrl: string;
  progressKey: string;
  completing: boolean;
  onComplete: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState(false);
  const [finished, setFinished] = useState(false);
  const [percent, setPercent] = useState(0);
  const watched = useRef(0);
  const submitted = useRef(false);
  const embedUrl = getBunnyVideoEmbedUrl(sourceUrl);
  const portalTarget = document.querySelector<HTMLElement>(".home2-page") ?? document.body;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const saveProgress = (seconds: number, duration: number) => {
    watched.current = seconds;
    if (Number.isFinite(duration) && duration > 0) {
      setPercent(Math.min(100, Math.floor(seconds / duration * 100)));
      try { sessionStorage.setItem(progressKey, String(watched.current)); } catch { /* Storage is optional. */ }
    }
  };

  const finishPlayback = () => {
    if (submitted.current) return;
    submitted.current = true;
    setFinished(true);
    setPercent(100);
    onComplete();
  };

  const updateProgress = (video: HTMLVideoElement) => {
    saveProgress(getWatchedVideoTime(video.played, watched.current), video.duration);
  };

  return createPortal(
    <div className="admin-modal-overlay portal-video-overlay" role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="portal-video-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="portal-video-modal-head">
          <strong>{title}</strong>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close video">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="portal-video-frame">
          {embedUrl ? <PortalBunnyTutorialPlayer title={title} embedUrl={embedUrl}
            progressKey={progressKey} onProgress={saveProgress} onFinished={finishPlayback}
            onError={() => setError(true)} /> : <video src={sourceUrl} aria-label={title} controls playsInline preload="metadata"
            controlsList="nodownload noremoteplayback" disablePictureInPicture
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              try {
                const saved = Number(sessionStorage.getItem(progressKey));
                if (Number.isFinite(saved) && saved > 0 && saved <= video.duration) {
                  watched.current = saved;
                  video.currentTime = Math.min(saved, Math.max(0, video.duration - 0.5));
                  setPercent(Math.floor(saved / video.duration * 100));
                }
              } catch { /* Playback still works without browser storage. */ }
            }}
            onTimeUpdate={(event) => updateProgress(event.currentTarget)}
            onSeeking={(event) => {
              const video = event.currentTarget;
              updateProgress(video);
              if (video.currentTime > watched.current + 0.5) video.currentTime = watched.current;
            }}
            onEnded={(event) => {
              const video = event.currentTarget;
              updateProgress(video);
              if (isVideoPlaybackComplete(watched.current, video.duration)) finishPlayback();
            }}
            onError={() => setError(true)}
          />}
        </div>
        {error ? (
          <p className="portal-video-watch-note" role="alert">
            The video could not load. Close and reopen the player to try again. Your watched progress is saved.
          </p>
        ) : (
          <p className="portal-video-watch-note" role="status">
            {finished ? "You’ve finished the tutorial. Saving completion unlocks the SureLC steps below."
              : `Watch the full tutorial to unlock your SureLC steps. ${percent}% watched. You can pause and resume; skipping ahead is disabled.`}
          </p>
        )}
        {finished && (
          <button type="button" className="portal-todo-link" disabled={completing} onClick={onComplete}>
            {completing ? "Saving completion…" : "Save video completion"}
          </button>
        )}
      </div>
    </div>, portalTarget,
  );
}
