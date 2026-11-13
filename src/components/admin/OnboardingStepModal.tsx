import { isSigningDocumentKind } from "../../../supabase/functions/_shared/onboardingSigningRules";
import { supportingFilesForFlow } from "../../../supabase/functions/_shared/onboardingAttachments";
import OnboardingSupportingFilesEditor from "./OnboardingSupportingFilesEditor";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { changedSigningFlows, documentRolloutUrl } from "@/lib/document-library";
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
  supportingFilesEnabled = false,
  onClose,
  onSaved,
  initialFieldFlow,
}: {
  row: EditorRow;
  token: string;
  limits: { video: number; document: number };
  supportingFilesEnabled?: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialFieldFlow?: "loa" | "ibo";
}) {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<EditorRow>(() => structuredClone(row));
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requestSignatures, setRequestSignatures] = useState(true);
  const changedFlows = changedSigningFlows(row, draft);
  const canStageRollout = changedFlows.length === 1 && !!row.flowContent[changedFlows[0]]?.assetId && draft.published && (changedFlows[0] === "loa" ? draft.showLoa : draft.showIbo);
  const willRequireSignatures = isSigningDocumentKind(draft.contentType) && draft.published && ((changedFlows.includes("loa") || !row.published || !row.showLoa) && draft.showLoa || (changedFlows.includes("ibo") || !row.published || !row.showIbo) && draft.showIbo);
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
  const preparing = Object.values(busy).some(Boolean);
  const fileType = [
    "ica",
    "w9",
    "comp_agreement",
    "signing_document",
    "document",
    "video",
    "welcome_video",
    "surelc_video",
  ].includes(draft.contentType);
  const video = draft.contentType.includes("video");
  const fixed =
    ["ica", "w9", "direct_deposit", "comp_agreement", "welcome_video", "surelc_video"].includes(row.contentType) ||
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
          draft.published &&
          (designation === "loa" ? draft.showLoa : draft.showIbo) &&
          !media
        )
          throw new Error(
            `Add ${designation.toUpperCase()} content before publishing.`,
          );
      }
      if (requestSignatures && canStageRollout) {
        if (!canStageRollout) throw new Error("Save the initial PDFs first, or replace one existing flow's PDF at a time to review a staged rollout.");
        if (changedFlows.length !== 1) throw new Error("Prepare one flow's new PDF at a time for a staged rollout. Each flow can have its own recipients and schedule.");
        const flow = changedFlows[0];
        if (!row.id || !row.published || !(flow === "loa" ? row.showLoa : row.showIbo)) throw new Error("Save and publish this onboarding step first, then request signatures from Documents & fields.");
        // Save text/settings while retaining the selected PDF. The rollout's
        // onboarding stage selects the new source atomically when released.
        const retained = { ...next, flowContent: { ...next.flowContent, [flow]: row.flowContent[flow] } };
        await saveEditorStep(token, retained);
        onSaved();
        navigate(documentRolloutUrl(row.id, flow, next.flowContent[flow]!.assetId!));
        return;
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
                        "signing_document",
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
            <p className="onboarding-hint">
              {fixed
                ? "This step has built-in behavior, so its content type is fixed. You can edit its content, stage, and visibility."
                : "You can change this step’s content type. Saving a new type replaces its current content selection."}
            </p>
            {draft.contentType === "direct_deposit" && <section className="onboarding-modal-section"><h3>Built-in direct deposit form</h3><p>Agents enter their name, address, bank, account and routing numbers, then sign the authorization. A completed PDF is generated and saved to their profile. No template upload is needed.</p><a className="admin-secondary-link" href="/portal/admin/signing-preview/direct-deposit" target="_blank" rel="noreferrer">Preview as a new agent</a></section>}
            {!fileType && (
              <div className="onboarding-link-fields">
                <label className="admin-field">
                  <span>
                    {draft.contentType === "system" || draft.contentType === "direct_deposit"
                      ? "Step destination"
                      : "Link URL"}
                  </span>
                  <input
                    value={draft.href}
                    readOnly={draft.contentType === "direct_deposit"}
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
                      openFields={initialFieldFlow === designation}
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
                  {isSigningDocumentKind(draft.contentType) && (designation === "loa" ? draft.showLoa : draft.showIbo) && !draft.flowContent[designation] && <p className="admin-error">Upload the {designation.toUpperCase()} signing PDF before publishing this step.</p>}
                  {draft.contentType === "w9" && <p className="onboarding-hint">Use a fillable W-9 with tax fields, signature, and date on page 1. The upload checks its fields before saving.</p>}
                  {draft.contentType === "comp_agreement" && <p className="onboarding-hint">This template applies to this flow. Use Document requests to send private, agent-specific agreements.</p>}
                  {supportingFilesEnabled && <OnboardingSupportingFilesEditor
                    designation={designation} token={token} limit={limits.document}
                    files={supportingFilesForFlow(draft.slug, draft.flowAttachments, designation)}
                    onChange={(files) => setDraft(previous => ({ ...previous, flowAttachments: { ...previous.flowAttachments, [designation]: files } }))}
                    onBusy={(value) => setBusy(previous => ({ ...previous, [`${designation}-supporting`]: value }))}
                  />}
                </section>
              ))}
            </div>
            {fileType && (
              <p className="onboarding-hint onboarding-preserve-note">
                {isSigningDocumentKind(draft.contentType)
                  ? "Existing signed agreements stay on file. Only the main uploaded PDF is signed; supporting files are separate reference documents."
                  : "Uploaded files are applied when you save. Cancel keeps the current content."}
              </p>
            )}
            {willRequireSignatures && <section className="document-step" aria-label="New signing PDF">
              <h3>New signing PDF · {changedFlows.map(flow => flow.toUpperCase()).join(" + ")}</h3>
              <p>Publishing this edition requires every applicable existing agent to sign it. Older signed copies stay on file; signatures of this exact edition remain valid.</p>
              <label className="document-check"><input type="checkbox" checked={requestSignatures && canStageRollout} disabled={!canStageRollout} onChange={event => setRequestSignatures(event.target.checked)} />Review a staged rollout before requiring signatures</label>
              {!canStageRollout && <p>Save as Draft to keep preparing. Publishing assigns this edition in the portal. To stage a replacement, prepare one existing flow at a time.</p>}
              <p>{requestSignatures && canStageRollout ? "Next, review the full audience, rollout order, and delivery. This save retains the current PDF until you start the rollout." : "Saving publishes the PDF and creates in-app signing requirements for all applicable existing agents. No email is sent. Draft uploads create no requests."}</p>
            </section>}
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
              {saving ? "Saving…" : requestSignatures && canStageRollout ? "Save & review rollout" : willRequireSignatures ? "Save & require signatures" : "Save changes"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
