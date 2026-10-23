import { useState } from "react";
import { FileText, Plus, X } from "lucide-react";
import OnboardingMediaInput from "./OnboardingMediaInput";
import {
  MAX_SUPPORTING_FILES,
  SURELC_REFERENCE_FILE,
  type SupportingFile,
} from "../../../supabase/functions/_shared/onboardingAttachments";

export default function OnboardingSupportingFilesEditor({
  files,
  designation,
  token,
  limit,
  onChange,
  onBusy,
}: {
  files: SupportingFile[];
  designation: "loa" | "ibo";
  token: string;
  limit: number;
  onChange: (files: SupportingFile[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  return (
    <section
      className="onboarding-supporting-editor"
      aria-label={`${designation.toUpperCase()} supporting files`}
    >
      <h5>Supporting files</h5>
      <p className="onboarding-hint">
        Add PDFs or Word documents alongside this step. Up to{" "}
        {MAX_SUPPORTING_FILES} files per flow.
      </p>
      <ul className="onboarding-supporting-list">
        {files.map((file) => (
          <li key={file.assetId ?? file.url}>
            <FileText size={18} aria-hidden="true" />
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              {file.filename}
            </a>
            <button
              type="button"
              className="onboarding-icon-button"
              disabled={uploading}
              aria-label={`Remove ${designation.toUpperCase()} supporting file ${file.filename}`}
              onClick={() => onChange(files.filter((item) => item !== file))}
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      {files.some((file) => file.url === SURELC_REFERENCE_FILE.url) && (
        <p className="onboarding-hint">
          This is the current shared quick reference. Uploading a new file
          replaces it for this flow.
        </p>
      )}
      {adding ? (
        <div>
          <OnboardingMediaInput
            designation={designation}
            kind="document"
            token={token}
            limit={limit}
            onBusy={(busy) => {
              setUploading(busy);
              onBusy(busy);
            }}
            onChange={(media) => {
              if (!media || media.mode !== "file" || !media.filename) return;
              onChange([
                ...files.filter(
                  (file) => file.url !== SURELC_REFERENCE_FILE.url,
                ),
                { ...media, mode: "file", filename: media.filename },
              ]);
              setAdding(false);
            }}
          />
          <button
            type="button"
            className="onboarding-text-button"
            onClick={() => setAdding(false)}
          >
            Cancel adding file
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="admin-secondary-link"
          disabled={files.length >= MAX_SUPPORTING_FILES}
          onClick={() => setAdding(true)}
        >
          <Plus size={16} />
          Add supporting file
        </button>
      )}
    </section>
  );
}
