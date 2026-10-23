import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import {
  CONTENT_LABELS,
  STAGES,
  type EditorRow,
} from "@/lib/onboarding-editor";
import { getBunnyVideoEmbedUrl } from "@/lib/bunny-player";
import { supportingFilesForFlow } from "../../../supabase/functions/_shared/onboardingAttachments";
import OnboardingSupportingFiles from "../OnboardingSupportingFiles";

export default function OnboardingStepPreview({
  row,
  initialFlow,
  onClose,
}: {
  row: EditorRow;
  initialFlow: "loa" | "ibo";
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [flow, setFlow] = useState(initialFlow);
  const [mediaError, setMediaError] = useState(false);
  const media = row.flowContent[flow];
  const video = row.contentType.includes("video");
  // Missing content for one flow must never use the other flow's uploaded file.
  const source =
    media?.url ||
    (row.contentType === "ica"
      ? "/documents/pncl-ica-standard.pdf"
      : !video && row.contentType !== "document"
        ? row.href
        : "");
  const embed = video ? getBunnyVideoEmbedUrl(source) : null;
  const pdf =
    row.contentType === "ica" ||
    /\.pdf(?:$|[?#])/i.test(media?.filename ?? source);
  const visible = flow === "loa" ? row.showLoa : row.showIbo;
  const attachments = supportingFilesForFlow(
    row.slug,
    row.flowAttachments,
    flow,
  );
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="onboarding-edit-modal onboarding-step-preview"
      aria-labelledby="onboarding-step-preview-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="onboarding-modal-header">
        <div>
          <h2 id="onboarding-step-preview-title">Preview onboarding step</h2>
          <p>{row.title}</p>
        </div>
        <button
          type="button"
          className="onboarding-icon-button"
          aria-label="Close step preview"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </header>
      <div className="onboarding-modal-body">
        <div className="onboarding-preview-toolbar">
          <div className="onboarding-segment" aria-label="Preview flow">
            {(["loa", "ibo"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={flow === item}
                onClick={() => {
                  setFlow(item);
                  setMediaError(false);
                }}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          <span>
            {STAGES.find((stage) => stage.id === row.phase)?.label} ·{" "}
            {CONTENT_LABELS[row.contentType]}
          </span>
          <span
            className={`onboarding-status ${row.published ? "published" : ""}`}
          >
            {row.published ? "Published" : "Draft"}
          </span>
        </div>
        {!row.published && (
          <p className="onboarding-preview-banner">
            Draft — agents cannot see this step yet.
          </p>
        )}
        {!visible && (
          <p className="onboarding-preview-banner">
            This step is hidden for {flow.toUpperCase()} agents.
          </p>
        )}
        <article className="onboarding-preview-content" key={flow}>
          <h3>{row.title}</h3>
          <p className="onboarding-preview-description">{row.description}</p>
          {source ? (
            <>
              {video ? (
                <div className="onboarding-preview-player">
                  {embed ? (
                    <iframe
                      src={`${embed}?autoplay=false`}
                      title={`${flow.toUpperCase()} video preview`}
                      allow="fullscreen"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      src={source}
                      aria-label={`${flow.toUpperCase()} video preview`}
                      controls
                      preload="metadata"
                      playsInline
                      onError={() => setMediaError(true)}
                    />
                  )}
                </div>
              ) : pdf ? (
                <iframe
                  className="onboarding-preview-pdf"
                  src={source}
                  title={`${flow.toUpperCase()} document preview`}
                />
              ) : null}
              {mediaError && (
                <p role="alert" className="admin-error">
                  The video could not load. Check the file or video link.
                </p>
              )}
              <a
                className="admin-secondary-link"
                href={source}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={16} />
                {video
                  ? "Open video"
                  : pdf || row.contentType === "document"
                    ? "Open document"
                    : row.actionLabel || "Open step destination"}
              </a>
            </>
          ) : (
            <p className="onboarding-hint">
              {row.contentType === "system"
                ? "This step is completed inside the agent Hub."
                : `No ${flow.toUpperCase()} content has been added yet.`}
            </p>
          )}
          {!!attachments.length && (
            <section className="onboarding-preview-resources">
              <h4>Supporting files</h4>
              <OnboardingSupportingFiles
                files={attachments}
                className="admin-secondary-link"
              />
            </section>
          )}
        </article>
      </div>
      <footer className="onboarding-modal-footer">
        <span>Preview only. No progress or signatures are recorded.</span>
        <button type="button" className="admin-primary-btn" onClick={onClose}>
          Done
        </button>
      </footer>
    </dialog>
  );
}
