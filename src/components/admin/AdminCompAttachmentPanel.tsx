import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, FileSignature, FileUp, Trash2 } from "lucide-react";
import {
  assignCompAttachment,
  deleteCompAttachment,
  listCompAttachments,
  type AdminCompAttachment,
} from "@/lib/admin-api";
import { toast } from "sonner";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Unable to read the selected file."));
    reader.readAsDataURL(file);
  });
}

export default function AdminCompAttachmentPanel({
  userId,
  userName,
  accessToken,
  onChanged,
}: {
  userId: string;
  userName: string;
  accessToken: string;
  onChanged?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<AdminCompAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Compensation Attachment");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const hasAttachment = attachments.length > 0;

  const loadAttachments = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listCompAttachments(accessToken, userId);
      setAttachments(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load comp attachments");
    } finally {
      setLoading(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    void loadAttachments();
  }, [loadAttachments]);

  const handleAssign = async () => {
    if (!pendingFile) {
      toast.error("Choose a PDF to assign.");
      return;
    }

    setSubmitting(true);
    try {
      const pdfBase64 = await readFileAsBase64(pendingFile);
      const result = await assignCompAttachment(accessToken, {
        userId,
        title: title.trim() || "Compensation Attachment",
        pdfBase64,
      });
      toast.success(result.message);
      setPendingFile(null);
      await loadAttachments();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to assign comp attachment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (attachment: AdminCompAttachment) => {
    if (!window.confirm(`Remove the pending "${attachment.title}" for ${userName}?`)) {
      return;
    }

    setDeletingId(attachment.id);
    try {
      const result = await deleteCompAttachment(accessToken, attachment.id);
      toast.success(result.message);
      await loadAttachments();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to remove comp attachment");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="admin-comp-attachment-panel">
      {!hasAttachment && (
        <div className="admin-form">
          <label className="admin-field">
            <span>Document title</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Compensation Attachment"
            />
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              if (file && file.type !== "application/pdf") {
                toast.error("Please choose a PDF file.");
                return;
              }
              setPendingFile(file);
            }}
          />

          <div className="admin-row-actions">
            <button
              type="button"
              className="admin-icon-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              <FileUp size={16} aria-hidden="true" />
              {pendingFile ? pendingFile.name : "Choose Kam-signed PDF"}
            </button>
            <button
              type="button"
              className="admin-primary-btn"
              onClick={() => void handleAssign()}
              disabled={submitting || !pendingFile}
            >
              <FileSignature size={16} aria-hidden="true" />
              {submitting ? "Assigning…" : "Assign to agent"}
            </button>
          </div>
        </div>
      )}

      {hasAttachment && (
        <p className="admin-inline-note">
          This agent already has a comp attachment on file. Remove the pending assignment to upload
          a different PDF.
        </p>
      )}

      <div className="admin-genesis-details-documents">
        <h4>Assigned documents</h4>
        {loading ? (
          <div className="onboarding-spinner admin-spinner" aria-label="Loading attachments" />
        ) : attachments.length === 0 ? (
          <p className="admin-empty">No comp attachment assigned yet.</p>
        ) : (
          <ul className="admin-user-todo-list">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="admin-user-todo-item">
                <div>
                  <strong>{attachment.title}</strong>
                  <p className="admin-inline-note">
                    {attachment.status === "signed"
                      ? `Signed ${formatDate(attachment.signedAt)} by ${attachment.signatureName ?? "agent"}`
                      : `Assigned ${formatDate(attachment.assignedAt)} — awaiting agent signature`}
                  </p>
                </div>
                <div className="admin-row-actions">
                  {attachment.unsignedUrl && (
                    <a
                      href={attachment.unsignedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="admin-secondary-link"
                    >
                      Kam-signed PDF
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  )}
                  {attachment.signedUrl && (
                    <a
                      href={attachment.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="admin-secondary-link"
                    >
                      Agent-signed copy
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  )}
                  {attachment.status === "pending" && (
                    <button
                      type="button"
                      className="admin-icon-btn"
                      disabled={deletingId === attachment.id}
                      onClick={() => void handleDelete(attachment)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      {deletingId === attachment.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
