import { useEffect, useRef, useState } from "react";
import { UploadCloud, FileText, Link2, Play, Eye, X } from "lucide-react";
import {
  stageEditorFile,
  validateVideoLink,
  type FlowMedia,
  type StepContentType,
} from "@/lib/onboarding-editor";
import { formatFileSize, prepareVideo } from "@/lib/video-compression";
import { getBunnyVideoEmbedUrl } from "@/lib/bunny-player";
export default function OnboardingMediaInput({
  designation,
  kind,
  media,
  token,
  limit,
  onChange,
  onBusy,
}: {
  designation: "loa" | "ibo";
  kind: StepContentType;
  media?: FlowMedia;
  token: string;
  limit: number;
  onChange: (media?: FlowMedia) => void;
  onBusy: (busy: boolean) => void;
}) {
  const isVideo = kind.includes("video");
  const [mode, setMode] = useState<"file" | "link">(media?.mode ?? "file");
  const [link, setLink] = useState(media?.mode === "link" ? media.url : "");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [percent, setPercent] = useState(0);
  const [original, setOriginal] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const onBusyRef = useRef(onBusy);
  onBusyRef.current = onBusy;
  useEffect(
    () => () => {
      controller.current?.abort();
      onBusyRef.current(false);
    },
    [],
  );
  const accept = isVideo
    ? "video/mp4,video/webm"
    : kind === "ica"
      ? ".pdf,application/pdf"
      : ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const choose = async (file?: File) => {
    if (!file) return;
    controller.current?.abort();
    const control = new AbortController();
    controller.current = control;
    setOriginal(file);
    setError("");
    setPreview(false);
    setBusy(true);
    onBusy(true);
    setPercent(0);
    try {
      const allowed = isVideo
        ? ["video/mp4", "video/webm"]
        : kind === "ica"
          ? ["application/pdf"]
          : [
              "application/pdf",
              "application/msword",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ];
      if (!allowed.includes(file.type))
        throw new Error(
          isVideo
            ? "Choose an MP4 or WebM video."
            : "Choose a supported document file.",
        );
      if (!file.size)
        throw new Error("This file is empty. Choose another file.");
      let prepared = file;
      if (isVideo)
        prepared = await prepareVideo(
          file,
          limit,
          (value, label) => {
            setPercent(value);
            setStatus(label);
          },
          control.signal,
        );
      else if (file.size > limit)
        throw new Error(`Choose a document under ${formatFileSize(limit)}.`);
      if (control.signal.aborted) return;
      setStatus("Uploading");
      setPercent(0);
      const next = await stageEditorFile(
        token,
        designation,
        kind,
        prepared,
        setPercent,
        control.signal,
      );
      if (control.signal.aborted) return;
      onChange(next);
      setStatus(
        file.size !== prepared.size
          ? `Ready · ${formatFileSize(file.size)} → ${formatFileSize(prepared.size)}`
          : "Ready to save",
      );
    } catch (e) {
      if (controller.current !== control) return;
      if (!control.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Unable to prepare this file.",
        );
      else setStatus("Upload canceled. Current content is unchanged.");
    } finally {
      if (controller.current === control) {
        setBusy(false);
        onBusy(false);
      }
    }
  };
  const changeMode = (next: "file" | "link") => {
    setMode(next);
    setPreview(false);
    setError("");
    if (next === "link")
      onChange(link.trim() ? { mode: "link", url: link } : undefined);
    else if (media?.mode === "link") onChange(undefined);
  };
  const previewUrl = mode === "link" ? link : media?.url;
  const embed = previewUrl ? getBunnyVideoEmbedUrl(previewUrl) : null;
  return (
    <div className="onboarding-media-input">
      {isVideo && (
        <div
          className="onboarding-segment"
          aria-label={`${designation.toUpperCase()} video source`}
        >
          <button
            type="button"
            aria-pressed={mode === "file"}
            disabled={busy}
            onClick={() => changeMode("file")}
          >
            <UploadCloud size={16} />
            Upload video
          </button>
          <button
            type="button"
            aria-pressed={mode === "link"}
            disabled={busy}
            onClick={() => changeMode("link")}
          >
            <Link2 size={16} />
            Video link
          </button>
        </div>
      )}
      {mode === "link" && isVideo ? (
        <>
          <label className="admin-field">
            <span>Video URL</span>
            <input
              aria-label={`${designation.toUpperCase()} video URL`}
              type="url"
              value={link}
              placeholder="Paste a supported video link"
              onChange={(e) => {
                setLink(e.target.value);
                setError("");
                setPreview(false);
                onChange(
                  e.target.value
                    ? { mode: "link", url: e.target.value }
                    : undefined,
                );
              }}
              onBlur={() => {
                if (link)
                  try {
                    validateVideoLink(link);
                  } catch (e) {
                    setError((e as Error).message);
                  }
              }}
            />
          </label>
          <button
            className="admin-secondary-link"
            type="button"
            onClick={() => {
              try {
                validateVideoLink(link);
                setError("");
                setPreview(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Play size={16} />
            Preview link
          </button>
          <p className="onboarding-hint">
            Bunny Stream or a direct MP4 / WebM link. Linked videos don’t need
            an upload.
          </p>
        </>
      ) : (
        <>
          <div
            className={`onboarding-dropzone${drag ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (busy) return;
              if (e.dataTransfer.files.length !== 1) {
                setError("Drop one file per flow.");
                return;
              }
              void choose(e.dataTransfer.files[0]);
            }}
          >
            <UploadCloud size={30} aria-hidden="true" />
            <strong>
              {isVideo
                ? "Drop a video here"
                : kind === "ica"
                  ? "Drop your PDF here"
                  : "Drop a document here"}
            </strong>
            <span>or</span>
            <button
              className="admin-secondary-link"
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {isVideo ? "Browse video" : "Browse files"}
            </button>
            <small>
              {isVideo
                ? "MP4 or WebM"
                : kind === "ica"
                  ? "PDF"
                  : "PDF, DOC or DOCX"}{" "}
              · up to {formatFileSize(limit)}
            </small>
            <input
              ref={input}
              type="file"
              hidden
              aria-label={`${designation.toUpperCase()} ${isVideo ? "video" : "document"} file`}
              accept={accept}
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          {(media?.mode === "file" || busy) && (
            <div className="onboarding-file">
              <FileText size={23} />
              <div>
                <strong>{busy ? original?.name : media?.filename}</strong>
                <small>
                  {busy
                    ? formatFileSize(original?.size ?? 0)
                    : formatFileSize(media?.size ?? 0)}
                </small>
              </div>
              {busy ? (
                <button
                  type="button"
                  className="onboarding-text-button"
                  onClick={() => controller.current?.abort()}
                >
                  Cancel
                </button>
              ) : (
                <>
                  <a
                    className="onboarding-text-button"
                    href={media?.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Eye size={16} />
                    Preview
                  </a>
                  <button
                    type="button"
                    className="onboarding-icon-button"
                    aria-label={`Remove ${designation.toUpperCase()} file`}
                    onClick={() => {
                      onChange(undefined);
                      setStatus("");
                      setOriginal(null);
                      setPreview(false);
                    }}
                  >
                    <X size={16} />
                  </button>
                </>
              )}
            </div>
          )}
          {busy && (
            <progress
              max="100"
              value={percent}
              aria-label={`${designation.toUpperCase()} ${status}`}
            />
          )}
          {status && (
            <p className="onboarding-hint" role="status">
              {status}
              {busy ? ` · ${percent}%` : ""}
            </p>
          )}
          {!busy && original && status.includes("canceled") && (
            <button
              type="button"
              className="onboarding-text-button"
              onClick={() => void choose(original)}
            >
              Retry file
            </button>
          )}
          {isVideo && (
            <p className="onboarding-hint">
              Oversized videos compress to about {formatFileSize(limit * 0.9)}{" "}
              before upload.
            </p>
          )}
        </>
      )}
      {preview && previewUrl && (
        <div className="onboarding-media-preview">
          <button
            type="button"
            aria-label="Close video preview"
            onClick={() => setPreview(false)}
          >
            <X size={16} />
          </button>
          {embed ? (
            <iframe
              src={`${embed}?autoplay=false`}
              title={`${designation.toUpperCase()} video preview`}
              allow="fullscreen"
            />
          ) : (
            <video
              src={previewUrl}
              controls
              preload="metadata"
              onError={() =>
                setError(
                  "This video could not be loaded. Check the link and its access settings.",
                )
              }
            />
          )}
        </div>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}{" "}
          {original && mode === "file" && !busy && (
            <button type="button" onClick={() => void choose(original)}>
              Retry
            </button>
          )}
        </p>
      )}
    </div>
  );
}
