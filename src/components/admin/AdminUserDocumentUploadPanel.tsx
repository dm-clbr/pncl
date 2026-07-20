import { useRef, useState, type ChangeEvent } from "react";
import { FileUp } from "lucide-react";
import {
  ADMIN_PROFILE_DOCUMENT_OPTIONS,
  uploadAdminProfileDocument,
  type AdminProfileDocumentType,
} from "@/lib/admin-profile-document-upload";
import { toast } from "sonner";

export default function AdminUserDocumentUploadPanel({
  userId,
  accessToken,
  onUploaded,
}: {
  userId: string;
  accessToken: string;
  onUploaded: () => void;
}) {
  const inputRefs = useRef<Partial<Record<AdminProfileDocumentType, HTMLInputElement | null>>>({});
  const [uploadingType, setUploadingType] = useState<AdminProfileDocumentType | null>(null);
  const [otherLabel, setOtherLabel] = useState("");

  const handlePick = (documentType: AdminProfileDocumentType) => {
    inputRefs.current[documentType]?.click();
  };

  const handleFileChange = async (
    documentType: AdminProfileDocumentType,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (documentType === "other" && !otherLabel.trim()) {
      toast.error("Enter a label for the document first.");
      return;
    }

    setUploadingType(documentType);
    try {
      const result = await uploadAdminProfileDocument(accessToken, {
        userId,
        documentType,
        file,
        label: documentType === "other" ? otherLabel : undefined,
      });
      toast.success(result.message);
      if (documentType === "other") {
        setOtherLabel("");
      }
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to upload document");
    } finally {
      setUploadingType(null);
    }
  };

  return (
    <div className="admin-user-document-upload-panel">
      <div className="admin-panel-head">
        <div>
          <h3>Upload documents for this agent</h3>
          <p>
            Use this when an agent emails their paperwork directly. Uploads are saved to their
            profile and mark the matching checklist steps complete when applicable.
          </p>
        </div>
      </div>

      <div className="admin-user-document-upload-grid">
        {ADMIN_PROFILE_DOCUMENT_OPTIONS.map((option) => (
          <div key={option.id} className="admin-user-document-upload-item">
            <div>
              <strong>{option.label}</strong>
              <p className="admin-inline-note">{option.hint}</p>
            </div>
            <button
              type="button"
              className="admin-icon-btn"
              disabled={uploadingType !== null}
              onClick={() => handlePick(option.id)}
            >
              <FileUp size={16} aria-hidden="true" />
              {uploadingType === option.id ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={(element) => {
                inputRefs.current[option.id] = element;
              }}
              type="file"
              accept={option.accept}
              className="admin-upload-input"
              onChange={(event) => void handleFileChange(option.id, event)}
            />
          </div>
        ))}
      </div>

      <label className="admin-field admin-user-document-upload-other-label">
        <span>Label for other documents</span>
        <input
          type="text"
          value={otherLabel}
          placeholder="e.g. State appointment letter"
          onChange={(event) => setOtherLabel(event.target.value)}
        />
      </label>
    </div>
  );
}
