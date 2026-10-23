import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  CONTENT_LABELS,
  STAGES,
  saveEditorStep,
  validateVideoLink,
  validateStepLink,
  type EditorRow,
  type StepContentType,
} from "@/lib/onboarding-editor";
import OnboardingMediaInput from "./OnboardingMediaInput";
export default function OnboardingStepModal({
  row,
  token,
  limits,
  onClose,
  onSaved,
}: {
  row: EditorRow;
  token: string;
  limits: { video: number; document: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<EditorRow>(() => structuredClone(row));
  const [busy, setBusy] = useState({ loa: false, ibo: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      active?.focus();
    };
  }, []);
  const preparing = busy.loa || busy.ibo;
  const fileType = [
    "ica",
    "document",
    "video",
    "welcome_video",
    "surelc_video",
  ].includes(draft.contentType);
  const video = draft.contentType.includes("video");
  const fixed =
    ["ica", "welcome_video", "surelc_video"].includes(row.contentType) ||
    row.completionType === "auto";
  const change = <K extends keyof EditorRow>(key: K, value: EditorRow[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (!draft.title.trim() || !draft.description.trim())
        throw new Error("Add a title and description.");
      if (draft.published && !draft.showLoa && !draft.showIbo)
        throw new Error("Choose at least one flow before publishing.");
      const next = {
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        href: validateStepLink(draft.href),
        external: draft.href.startsWith("https://"),
      };
      for (const designation of ["loa", "ibo"] as const) {
        const media = next.flowContent[designation];
        if (video && media?.mode === "link")
          next.flowContent = {
            ...next.flowContent,
            [designation]: { ...media, url: validateVideoLink(media.url) },
          };
        if (
          fileType &&
          draft.contentType !== "ica" &&
          draft.published &&
          (designation === "loa" ? draft.showLoa : draft.showIbo) &&
          !media
        )
          throw new Error(
            `Add ${designation.toUpperCase()} content before publishing.`,
          );
      }
      await saveEditorStep(token, next);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this step.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="onboarding-edit-modal"
      aria-labelledby="onboarding-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form onSubmit={save}>
        <header className="onboarding-modal-header">
          <div>
            <h2 id="onboarding-modal-title">
              {row.id ? "Edit onboarding step" : "Add onboarding step"}
            </h2>
            <p>
              {row.id
                ? row.title
                : "Create content for your LOA and IBO flows."}
            </p>
          </div>
          <button
            type="button"
            className="onboarding-icon-button"
            aria-label="Close editor"
            disabled={saving}
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="onboarding-modal-body">
          <fieldset disabled={saving}>
            <label className="admin-field">
              <span>Step title</span>
              <input
                autoFocus
                required
                maxLength={180}
                value={draft.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Description</span>
              <textarea
                required
                rows={2}
                maxLength={2000}
                value={draft.description}
                onChange={(e) => change("description", e.target.value)}
              />
            </label>
            <div className="onboarding-field-grid">
              <label className="admin-field">
                <span>Stage</span>
                <select
                  value={draft.phase}
                  onChange={(e) =>
                    change("phase", e.target.value as EditorRow["phase"])
                  }
                >
                  {STAGES.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>Status</span>
                <select
                  value={draft.published ? "published" : "draft"}
                  onChange={(e) =>
                    change("published", e.target.value === "published")
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>
              <label className="admin-field">
                <span>Content type</span>
                <select
                  disabled={fixed || preparing}
                  value={draft.contentType}
                  onChange={(e) => {
                    change("contentType", e.target.value as StepContentType);
                    change("flowContent", {});
                  }}
                >
                  {(fixed
                    ? [row.contentType]
                    : ([
                        "system",
                        "document",
                        "video",
                        "link",
                      ] as StepContentType[])
                  ).map((type) => (
                    <option key={type} value={type}>
                      {CONTENT_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!fileType && (
              <div className="onboarding-link-fields">
                <label className="admin-field">
                  <span>
                    {draft.contentType === "system"
                      ? "Step destination"
                      : "Link URL"}
                  </span>
                  <input
                    value={draft.href}
                    placeholder="https://… or /portal/…"
                    onChange={(e) => change("href", e.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Button label</span>
                  <input
                    required={!!draft.href}
                    value={draft.actionLabel}
                    onChange={(e) => change("actionLabel", e.target.value)}
                  />
                </label>
              </div>
            )}
            <div className="onboarding-modal-section">
              <h3>
                {fileType
                  ? video
                    ? "Videos by flow"
                    : "Documents by flow"
                  : "Visibility by flow"}
              </h3>
              <p>
                {fileType
                  ? "Choose separate content for each flow."
                  : "Choose which agents see this step."}
              </p>
            </div>
            <div className="onboarding-flow-panels">
              {(["loa", "ibo"] as const).map((designation) => (
                <section
                  className="onboarding-flow-panel"
                  key={designation}
                  aria-label={`${designation.toUpperCase()} content`}
                >
                  <header>
                    <h4>{designation.toUpperCase()}</h4>
                    <label>
                      <input
                        type="checkbox"
                        checked={
                          !!(designation === "loa"
                            ? draft.showLoa
                            : draft.showIbo)
                        }
                        onChange={(e) =>
                          change(
                            designation === "loa" ? "showLoa" : "showIbo",
                            e.target.checked,
                          )
                        }
                      />
                      Show this step
                    </label>
                  </header>
                  {fileType && (
                    <OnboardingMediaInput
                      key={`${designation}-${draft.contentType}`}
                      designation={designation}
                      kind={draft.contentType}
                      media={draft.flowContent[designation]}
                      token={token}
                      limit={video ? limits.video : limits.document}
                      onChange={(media) =>
                        setDraft((previous) => ({
                          ...previous,
                          flowContent: {
                            ...previous.flowContent,
                            [designation]: media,
                          },
                        }))
                      }
                      onBusy={(value) =>
                        setBusy((previous) => ({
                          ...previous,
                          [designation]: value,
                        }))
                      }
                    />
                  )}
                  {draft.contentType === "ica" &&
                    !draft.flowContent[designation] && (
                      <a
                        className="onboarding-hint"
                        href="/documents/pncl-ica-standard.pdf"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview current standard ICA
                      </a>
                    )}
                </section>
              ))}
            </div>
            {fileType && (
              <p className="onboarding-hint onboarding-preserve-note">
                {draft.contentType === "ica"
                  ? "Existing signed agreements stay on file. New versions apply to future signatures."
                  : "Uploaded files are applied when you save. Cancel keeps the current content."}
              </p>
            )}
            {error && (
              <p role="alert" className="admin-error">
                {error}
              </p>
            )}
          </fieldset>
        </div>
        <footer className="onboarding-modal-footer">
          <span role="status">
            {preparing
              ? "Finish preparing the file to save."
              : saving
                ? "Saving changes…"
                : "Changes are applied when you save."}
          </span>
          <div>
            <button
              type="button"
              className="admin-secondary-link"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="admin-primary-btn"
              disabled={preparing || saving}
              type="submit"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
